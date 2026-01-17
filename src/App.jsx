import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import html2canvas from 'html2canvas';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import 'leaflet/dist/leaflet.css';
import './App.css';

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  if (!session) return <Auth onLogin={setSession} />;

  return <MainMap session={session} />;
}

function MainMap({ session }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersLayer = useRef(null);
  const lineLayer = useRef(null);
  
  // --- STATE ---
  const [memories, setMemories] = useState([]);
  const [feedMode, setFeedMode] = useState('mine'); 
  const [viewYear, setViewYear] = useState(2030);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [tempLocation, setTempLocation] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [form, setForm] = useState({ 
    title: "", 
    date: new Date().toISOString().split('T')[0], 
    desc: "", 
    addressQuery: "", 
    file: null 
  });

  // --- 1. FETCH MEMORIES ---
  const fetchMemories = async () => {
    console.log("Fetching memories...");
    
    let query = supabase.from('memories').select(`
      *,
      profiles (username),
      likes (count)
    `);

    if (feedMode === 'mine') {
      query = query.eq('user_id', session.user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching:", error);
      alert("Error fetching data: " + error.message);
    } else {
      console.log("Found memories:", data);
      
      const formatted = data.map(m => ({
        ...m,
        like_count: m.likes?.[0]?.count || 0,
        username: m.profiles?.username || 'Unknown' 
      }));
      setMemories(formatted || []);
    }
  };

  useEffect(() => { fetchMemories(); }, [feedMode]);

  // --- 2. MAP SETUP ---
  useEffect(() => {
    if (leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current).setView([20, 0], 2);
    
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap.current);
    tiles.getContainer().className += ' dark-mode-tiles';
    
    markersLayer.current = L.layerGroup().addTo(leafletMap.current);
    lineLayer.current = L.polyline([], { color: '#4ecdc4', weight: 4, dashArray: '10, 10' }).addTo(leafletMap.current);
    
    leafletMap.current.on('click', (e) => window.dispatchEvent(new CustomEvent('map-click', { detail: e.latlng })));
  }, []);

  // --- 3. CLICK LISTENER ---
  useEffect(() => {
    const handleMapClick = (e) => {
      if (isAddingMode) {
        setTempLocation([e.detail.lat, e.detail.lng]);
        leafletMap.current.eachLayer(l => l.options.opacity === 0.5 && leafletMap.current.removeLayer(l));
        L.marker([e.detail.lat, e.detail.lng], { opacity: 0.5 }).addTo(leafletMap.current);
      }
    };
    window.addEventListener('map-click', handleMapClick);
    return () => window.removeEventListener('map-click', handleMapClick);
  }, [isAddingMode]);

  // --- 4. LIKE FUNCTION ---
  const handleLike = async (memoryId) => {
    const { error } = await supabase.from('likes').insert([{ user_id: session.user.id, memory_id: memoryId }]);
    if (!error) {
      setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, like_count: m.like_count + 1 } : m));
    }
  };

  // --- 5. SAVE MEMORY ---
  const saveMemory = async () => {
    if (!tempLocation) return alert("Click the map to set location!");
    setUploading(true);

    let mediaUrl = null;
    if (form.file) {
      const fileExt = form.file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('memories').upload(fileName, form.file);
      if (error) {
        alert("Upload Error: " + error.message);
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from('memories').getPublicUrl(fileName);
      mediaUrl = data.publicUrl;
    }

    const year = parseInt(form.date.split('-')[0]);
    
    const { error } = await supabase.from('memories').insert([{
      user_id: session.user.id,
      title: form.title,
      description: form.desc,
      date: form.date,
      year: year,
      location_lat: tempLocation[0],
      location_lng: tempLocation[1],
      media_url: mediaUrl
    }]);

    if (error) {
      alert("Database Error: " + error.message);
    } else {
      await fetchMemories();
      
      // AUTO-JUMP TO PIN
      leafletMap.current.flyTo([tempLocation[0], tempLocation[1]], 8, { duration: 1.5 });
      setViewYear(year); 

      setIsAddingMode(false);
      setTempLocation(null);
      setForm({ title: "", date: new Date().toISOString().split('T')[0], desc: "", addressQuery: "", file: null });
      leafletMap.current.eachLayer(l => l.options.opacity === 0.5 && leafletMap.current.removeLayer(l));
    }
    setUploading(false);
  };

  // --- 6. RENDER MARKERS ---
  useEffect(() => {
    if (!leafletMap.current) return;
    
    const active = memories; 

    markersLayer.current.clearLayers();
    
    active.forEach(mem => {
      const isMine = mem.user_id === session.user.id;
      const color = isMine ? '#ff0055' : '#4ecdc4';

      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 15px ${color};"></div>`,
        iconSize: [14, 14], iconAnchor: [9, 9] 
      });

      const popupDiv = document.createElement('div');
      popupDiv.className = 'sexy-popup';
      popupDiv.innerHTML = `
        ${mem.media_url ? `<img src="${mem.media_url}" style="width:100%; border-radius:8px; margin-bottom:8px;" />` : ''}
        <div style="font-size:0.8rem; color:#aaa; margin-bottom:5px;">@${mem.username}</div>
        <strong>${mem.title}</strong><br/>
        <span style="color:#888; font-size:0.8rem;">${mem.date}</span><br/>
        <div style="margin: 5px 0;">${mem.description || ''}</div>
        <button class="btn-like" id="like-${mem.id}">❤️ ${mem.like_count}</button>
      `;

      setTimeout(() => {
         const btn = popupDiv.querySelector(`#like-${mem.id}`);
         if(btn) btn.onclick = () => handleLike(mem.id);
      }, 0);

      L.marker([mem.location_lat, mem.location_lng], { icon }).bindPopup(popupDiv).addTo(markersLayer.current);
    });
    
    if (feedMode === 'mine') {
      // THE FIX IS HERE (changed mem to m)
      lineLayer.current.setLatLngs(active.map(m => [m.location_lat, m.location_lng]));
    }

  }, [viewYear, memories, feedMode]);

  return (
    <div className="app-container">
      <div ref={mapRef} className="map-container" style={{ cursor: isAddingMode ? 'crosshair' : 'grab' }} />

      {!isAddingMode && (
        <div className="ui-layer">
          <h1 className="title">ChronoMap</h1>
          <div className="feed-toggle">
            <button className={feedMode === 'mine' ? 'active' : ''} onClick={() => setFeedMode('mine')}>My Map</button>
            <button className={feedMode === 'explore' ? 'active' : ''} onClick={() => setFeedMode('explore')}>🌍 Explore</button>
          </div>
          
          <p className="subtitle" style={{marginTop:'10px'}}>Timeline: {viewYear}</p>
          <input type="range" min="2000" max="2030" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} className="time-slider" />
          
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={() => setIsAddingMode(true)}>➕ Pin</button>
            <button className="btn-profile" onClick={() => supabase.auth.signOut()}>Logout</button>
          </div>
        </div>
      )}

      {isAddingMode && (
        <div className="form-overlay">
          <div className="form-card">
            <h2>Pin Memory</h2>
            <p style={{color: tempLocation?'#4ecdc4':'#666', fontSize:'0.8rem', marginBottom: '10px'}}>
              {tempLocation ? "📍 Location Set" : "👇 Click the map"}
            </p>
            <input type="text" placeholder="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="input-field" />
            <textarea placeholder="Description" value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} className="input-field textarea" />
            <input type="file" accept="image/*" onChange={e => setForm({...form, file: e.target.files[0]})} className="input-field" />
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setIsAddingMode(false)}>Cancel</button>
              <button className="btn-save" onClick={saveMemory} disabled={!tempLocation || uploading}>
                {uploading ? "Uploading..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}