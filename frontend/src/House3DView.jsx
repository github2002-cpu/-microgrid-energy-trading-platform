import React, { useState, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Line as DreiLine, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

function DataPoint({ position, color, data, scale }) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
        scale={hovered ? scale * 1.5 : scale}
      >
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.8 : 0.2} roughness={0.1} />
      </mesh>
      
      {hovered && (
        <Html distanceFactor={10} position={[0, 0.5, 0]} style={{ zIndex: 100 }}>
          <div style={{
            background: 'var(--panel-bg)', padding: '10px', borderRadius: '8px', 
            border: '1px solid var(--border-color)', color: 'var(--text-main)', 
            fontSize: '0.8rem', width: '160px', pointerEvents: 'none',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}>
            <div style={{fontWeight: 'bold', marginBottom: '6px', color: 'var(--accent-blue)'}}>
              {new Date(data.timestamp).toLocaleString()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Price:</span> <strong>${data.clearing_price.toFixed(3)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Supply:</span> <span>{data.supply.toFixed(1)} kWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Demand:</span> <span>{data.demand.toFixed(1)} kWh</span>
            </div>
            {data.tradeQuantity > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #334155', paddingTop: '4px', color: '#10b981' }}>
                <span>Traded:</span> <strong>{data.tradeQuantity.toFixed(2)} kWh</strong>
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
              (Battery%: N/A in Historical Log)
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function DataSurface({ pointsData, showPeaks }) {
  const [activePeakIdx, setActivePeakIdx] = useState(null);

  const { geometry, peaks } = useMemo(() => {
    if (pointsData.length < 3) return { geometry: null, peaks: [] };
    
    const minX = -10;
    const maxX = 10;
    const minZ = -10;
    const maxZ = 10;
    
    // Exact symmetrical bounds
    const sizeX = 20;
    const sizeZ = 20;
    const segs = 80;

    const geom = new THREE.PlaneGeometry(sizeX, sizeZ, segs, segs);
    geom.rotateX(-Math.PI / 2); 
    // Already perfectly centered since PlaneGeometry generates centered on 0,0,0


    const positions = geom.attributes.position.array;
    const colors = new Float32Array(positions.length);
    const calculatedPoints = [];

    // IDW interpolation
    for (let i = 0; i < positions.length; i += 3) {
      const px = positions[i];
      const pz = positions[i + 2];
      
      let weightSum = 0;
      let ySum = 0;
      
      for (let j = 0; j < pointsData.length; j++) {
        const pt = pointsData[j];
        const distSq = Math.pow(px - pt.x, 2) + Math.pow(pz - pt.z, 2);
        // Sharper IDW falloff for tighter, distinct peaks (scientific plot style)
        // Exponent 2.0 creates aggressive cliffs around known data, making local variation very natural
        const w = 1 / (Math.pow(distSq, 2.0) + 0.02); 
        weightSum += w;
        ySum += w * pt.y;
      }
      
      const py = weightSum === 0 ? 0 : ySum / weightSum;
      positions[i + 1] = py;
      
      calculatedPoints.push({ x: px, y: py, z: pz });
      
      // Color Mapping
      // Value mapped to extreme strictly bounded scale max 15 for symmetry
      const pyNorm = Math.max(0, Math.min(1, py / 15));
      const color = new THREE.Color();
      // Deep Blue (260) -> Cyan (180) -> Green (120) -> Yellow (60) -> Red (0)
      color.setHSL((1 - pyNorm) * 260 / 360, 1.0, 0.45); // slightly darker lightness for solid academic look
      
      colors[i] = color.r;
      colors[i+1] = color.g;
      colors[i+2] = color.b;
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals(); // smooth lighting normals
    
    // Feature Extraction: Finding local maxima peaks in the grid
    const localPeaks = [];
    const pointsPerRow = segs + 1;
    
    for (let row = 1; row < segs; row++) {
      for (let col = 1; col < segs; col++) {
        const idx = row * pointsPerRow + col;
        const currentY = calculatedPoints[idx].y;
        
        // 8-neighbor comparison
        const neighbors = [
          calculatedPoints[idx - 1].y,
          calculatedPoints[idx + 1].y,
          calculatedPoints[idx - pointsPerRow].y,
          calculatedPoints[idx + pointsPerRow].y,
          calculatedPoints[idx - pointsPerRow - 1].y,
          calculatedPoints[idx - pointsPerRow + 1].y,
          calculatedPoints[idx + pointsPerRow - 1].y,
          calculatedPoints[idx + pointsPerRow + 1].y,
        ];
        
        const isMax = neighbors.every(ny => currentY > ny);
        if (isMax) {
          localPeaks.push(calculatedPoints[idx]);
        }
      }
    }
    
    // Filter to retain mathematically significant upper-echelon peaks
    // Lowered threshold to 50% to ensure multiple valid local maxima arrays are structurally flagged across volatile datasets
    const maxY = Math.max(...calculatedPoints.map(p => p.y));
    const minY = Math.min(...calculatedPoints.map(p => p.y));
    const thresholdY = minY + (maxY - minY) * 0.50; 
    
    const significantPeaks = localPeaks.filter(p => p.y >= thresholdY).map(p => {
      // Find nearest original data payload to surface peak via Euclidean distance spread
      let nearestDist = Infinity;
      let nearestPt = null;
      for (let pt of pointsData) {
        const d = Math.pow(p.x - pt.x, 2) + Math.pow(p.z - pt.z, 2);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPt = pt;
        }
      }
      
      // Calculate inline analytical recommendation based on relative market pricing
      let rec = 'WAIT';
      if (nearestPt && nearestPt.clearing_price !== undefined) {
        const pMax = Math.max(...pointsData.map(d => d.clearing_price || 0));
        const pMin = Math.min(...pointsData.map(d => d.clearing_price || Infinity));
        const pAvg = (pMax + pMin) / 2;
        
        if (nearestPt.clearing_price > pAvg + (pMax - pAvg) * 0.3) rec = 'SELL (High Price)';
        else if (nearestPt.clearing_price < pAvg - (pAvg - pMin) * 0.3) rec = 'BUY (Low Price)';
      }
      
      return { ...p, originalData: nearestPt, recommendation: rec };
    });

    return { geometry: geom, peaks: significantPeaks };
  }, [pointsData]);

  if (!geometry) return null;

  return (
    <group>
      <mesh geometry={geometry}>
        {/* Academic style: no emissive glow, standard roughness */}
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.6} metalness={0.1} flatShading={false} />
      </mesh>
      <mesh geometry={geometry} position={[0, 0.01, 0]}>
        {/* MATLAB style black wireframe */}
        <meshBasicMaterial color="#333333" wireframe transparent opacity={0.2} />
      </mesh>
      
      {showPeaks && peaks.map((p, i) => (
         <group key={i} position={[p.x, p.y + 0.6, p.z]}>
           <mesh 
             onClick={(e) => { e.stopPropagation(); setActivePeakIdx(activePeakIdx === i ? null : i); }}
             onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
             onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'default'; }}
           >
             <sphereGeometry args={[0.35, 16, 16]} />
             <meshStandardMaterial color="#e60000" roughness={0.2} metalness={0.1} emissive="#ff0000" emissiveIntensity={activePeakIdx === i ? 0.8 : 0.2} />
           </mesh>

           {/* Interactive Analytical Tooltip */}
           {activePeakIdx === i && p.originalData && (
             <Html distanceFactor={15} position={[0, 1.2, 0]} style={{ zIndex: 110 }}>
               <div style={{
                 background: 'rgba(255, 255, 255, 0.95)', padding: '12px', borderRadius: '4px', 
                 border: '1px solid #94a3b8', color: '#1e293b', fontSize: '0.85rem', width: '210px',
                 boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
               }}>
                 <div style={{fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', color: '#0f172a'}}>
                   ⚠️ LOCAL MAXIMA
                 </div>
                 <div style={{color: '#64748b', fontSize: '0.75rem', marginBottom: '8px'}}>
                   {new Date(p.originalData.timestamp).toLocaleString()}
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                   <span>Price:</span> <strong style={{color: '#dc2626'}}>${p.originalData.clearing_price.toFixed(3)}</strong>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                   <span>Demand:</span> <span>{p.originalData.demand.toFixed(1)} kWh</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                   <span>Supply:</span> <span>{p.originalData.supply.toFixed(1)} kWh</span>
                 </div>
                 <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 'bold', letterSpacing: '0.5px', color: p.recommendation.includes('SELL') ? '#dc2626' : p.recommendation.includes('BUY') ? '#059669' : '#d97706' }}>
                   ACTION: {p.recommendation}
                 </div>
               </div>
             </Html>
           )}
         </group>
      ))}
    </group>
  );
}

export default function House3DView({ historyData, selectedHouseholdId }) {
  const [viewMode, setViewMode] = useState('surface');
  const [showPeaks, setShowPeaks] = useState(false);
  const pointsData = useMemo(() => {
    let filtered = historyData;
    if (selectedHouseholdId !== 'ALL') {
      filtered = historyData.filter(row => 
        row.trades && row.trades.some(t => t.buyer_id === selectedHouseholdId || t.seller_id === selectedHouseholdId)
      );
    }

    if (filtered.length === 0) return [];
    
    // Reverse again if needed so X is chronological
    const chronoData = [...filtered].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Bounds
    const maxPrice = Math.max(...chronoData.map(d => d.clearing_price), 0.001);
    const minPrice = Math.min(...chronoData.map(d => d.clearing_price));
    
    const maxSupply = Math.max(...chronoData.map(d => d.supply), 0.001);
    const minSupply = Math.min(...chronoData.map(d => d.supply));

    const maxDemand = Math.max(...chronoData.map(d => d.demand), 0.001);
    const minDemand = Math.min(...chronoData.map(d => d.demand));

    return chronoData.map((d, index) => {
      // X = Time normalized perfectly between -10 and 10
      const xNorm = chronoData.length > 1 ? index / (chronoData.length - 1) : 0.5;
      const x = (xNorm - 0.5) * 20;
      
      // Calculate Normalized Base Variables
      const rangeP = maxPrice === minPrice ? 1 : maxPrice - minPrice;
      const rangeD = maxDemand === minDemand ? 1 : maxDemand - minDemand;
      const rangeS = maxSupply === minSupply ? 1 : maxSupply - minSupply;
      
      const pNormRaw = (d.clearing_price - minPrice) / rangeP;
      const dNormRaw = (d.demand - minDemand) / rangeD;
      const sNormRaw = (d.supply - minSupply) / rangeS;
      
      // Y = Combined Energy Function rigidly capped mathematically at 15 for symmetry
      const combinedEnergy = (pNormRaw * 0.6) + (dNormRaw * 0.3) + (sNormRaw * 0.1);
      const y = combinedEnergy * 15;
      
      // Z = Grid Supply properly normalized across entire -10 to 10 spatial base
      const z = (sNormRaw - 0.5) * 20;
      
      // Color logic (for literal points view)
      let color = '#fbbf24'; // yellow mid
      if (combinedEnergy > 0.6) color = '#ef4444'; // red
      if (combinedEnergy < 0.4) color = '#10b981'; // green
      
      // Sphere size = Traded Quantity proportion (Fallback for Battery %)
      let tradeQuantityStr = 0;
      if (selectedHouseholdId !== 'ALL') {
        const tradesMatch = d.trades.filter(t => t.buyer_id === selectedHouseholdId || t.seller_id === selectedHouseholdId);
        tradeQuantityStr = tradesMatch.reduce((sum, t) => sum + t.quantity_kwh, 0);
      }
      
      // Avoid tiny invisible spheres
      const baseScale = 1;
      const scale = tradeQuantityStr > 0 ? Math.max(0.6, Math.min(tradeQuantityStr * 0.5, 2)) : baseScale;
      
      return { ...d, x, y, z, color, scale, tradeQuantity: tradeQuantityStr };
    });
  }, [historyData, selectedHouseholdId]);

  return (
    <div style={{ width: '100%', height: '550px', background: '#ffffff', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
      {pointsData.length === 0 ? (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          No trades executed by this household in the selected timeframe.
        </div>
      ) : (
        <Canvas camera={{ position: [20, 16, 20], fov: 42 }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[10, 20, 10]} intensity={1.0} castShadow />
          <pointLight position={[-10, -5, -10]} intensity={0.4} />
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} target={[0, 6, 0]} />
          
          <group position={[0, -5, 0]}>
            {viewMode === 'point' ? (
              <>
                {pointsData.map((d, i) => (
                  <DataPoint key={d.timestamp + i} position={[d.x, d.y, d.z]} color={d.color} data={d} scale={d.scale} />
                ))}
                
                {pointsData.length > 1 && (
                  <DreiLine
                    points={pointsData.map(p => [p.x, p.y, p.z])}
                    color="#475569"
                    lineWidth={2}
                  />
                )}
              </>
            ) : (
              <DataSurface pointsData={pointsData} showPeaks={showPeaks} />
            )}

            {/* Trajectory Overlay for Specific Nodes during Surface View */}
            {viewMode === 'surface' && selectedHouseholdId !== 'ALL' && pointsData.length > 1 && (
               <DreiLine
                 points={pointsData.map(p => [p.x, p.y + 0.1, p.z])}
                 color="#fbbf24"
                 lineWidth={4}
               />
            )}
            
            {/* Visual Axes & Grids */}
            <gridHelper args={[20, 20, '#cbd5e1', '#f1f5f9']} position={[0, 0, 0]} />
            
            {/* Custom Prominent Academic Axes aligned perfectly to bounding MATLAB box corner [-10, 0, -10] */}
            <DreiLine points={[[-10, 0, -10], [10, 0, -10]]} color="#0f172a" lineWidth={3} />
            <DreiLine points={[[-10, 0, -10], [-10, 15, -10]]} color="#0f172a" lineWidth={3} />
            <DreiLine points={[[-10, 0, -10], [-10, 0, 10]]} color="#0f172a" lineWidth={3} />
            
            {/* Grounding Shadow */}
            <ContactShadows resolution={1024} scale={30} blur={2.0} opacity={0.3} far={15} color="#334155" position={[0, -0.05, 0]} />

            {/* Axis Labels - Spaced smoothly to prevent clipping */}
            <Html position={[10.5, 0, -10]} style={{ color: '#1e293b', fontSize: '0.85rem', fontWeight: 'bold', pointerEvents: 'none', fontFamily: 'sans-serif', transform: 'translateX(-50%)' }}>Time</Html>
            <Html position={[-10, 15.5, -10]} style={{ color: '#1e293b', fontSize: '0.85rem', fontWeight: 'bold', pointerEvents: 'none', fontFamily: 'sans-serif', transform: 'translateY(-50%)' }}>Energy</Html>
            <Html position={[-10, 0, 10.5]} style={{ color: '#1e293b', fontSize: '0.85rem', fontWeight: 'bold', pointerEvents: 'none', fontFamily: 'sans-serif', transform: 'translateX(-50%)' }}>Supply</Html>
          </group>
        </Canvas>
      )}
      
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 5, border: '1px solid #e2e8f0', color: '#334155' }}>
        <strong style={{color: '#0f172a'}}>DATA MATRICES:</strong><br/>
        X = Timeline <br/>
        Y = Combined Function <span style={{color: '#64748b'}}>(Height)</span><br/>
        Z = Grid Supply Base <span style={{color: '#64748b'}}>(Depth)</span><br/>
        <div style={{ margin: '6px 0', borderBottom: '1px solid #cbd5e1' }}></div>
        {viewMode === 'point' ? (
           <><strong>Nodes:</strong> <span style={{color: '#059669'}}>Low</span> / <span style={{color: '#d97706'}}>Med</span> / <span style={{color: '#dc2626'}}>High</span><br/><strong>Volume:</strong> Trade Quantity</>
        ) : (
           <>
              <strong style={{color: '#0f172a'}}>SURFACE ALGORITHMS:</strong><br/>
              <strong>Math:</strong> IDW Extrapolation<br/>
              <strong>Heat:</strong> <span style={{color: '#2563eb'}}>Blue (Min)</span> → <span style={{color: '#059669'}}>Green</span> → <span style={{color: '#dc2626'}}>Red (Max)</span>
           </>
        )}
      </div>

      {/* Decision Legend Overlay */}
      <div style={{ position: 'absolute', bottom: '10px', right: '10px', backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 5, border: '1px solid #e2e8f0', color: '#334155' }}>
        <strong style={{color: '#0f172a', borderBottom: '1px solid #cbd5e1', display: 'block', marginBottom: '6px', paddingBottom: '2px'}}>DECISION MATRIX</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}><span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626'}}></span> <span style={{color: '#dc2626', fontWeight: 'bold'}}>SELL</span> <span style={{color: '#64748b'}}>(High Price)</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}><span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#059669'}}></span> <span style={{color: '#059669', fontWeight: 'bold'}}>BUY</span> <span style={{color: '#64748b'}}>(Low Price)</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}><span style={{display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#d97706'}}></span> <span style={{color: '#d97706', fontWeight: 'bold'}}>WAIT</span> <span style={{color: '#64748b'}}>(Neutral)</span></div>
      </div>

      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: 'flex', gap: '5px' }}>
        {viewMode === 'surface' && (
          <button 
            onClick={() => setShowPeaks(!showPeaks)}
            style={{ padding: '6px 12px', background: showPeaks ? 'var(--accent-red)' : 'var(--panel-bg)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: showPeaks ? 'bold' : 'normal' }}
          >
            🏔 Show Peaks: {showPeaks ? 'ON' : 'OFF'}
          </button>
        )}
        <button 
          onClick={() => setViewMode('point')}
          style={{ padding: '6px 12px', background: viewMode === 'point' ? 'var(--accent-blue)' : 'var(--panel-bg)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: viewMode==='point'?'bold':'normal' }}
        >
          ● Point View
        </button>
        <button 
          onClick={() => setViewMode('surface')}
          style={{ padding: '6px 12px', background: viewMode === 'surface' ? 'var(--accent-blue)' : 'var(--panel-bg)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: viewMode==='surface'?'bold':'normal' }}
        >
          ▤ Surface View
        </button>
      </div>
    </div>
  );
}
