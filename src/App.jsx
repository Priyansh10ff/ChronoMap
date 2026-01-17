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

  const fetchMemories = async () => {
    console.log("Fetching memories...");
    let query = supabase.from('memories').select(`*, profiles (username), likes (count)`);
    if (feedMode === 'mine') {
      query = query.eq('user_id', session.user.id);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Error fetching:", error);
    } else {
      const formatted = data.map(m => ({
        ...m,
        like_count: m.likes?.[0]?.count || 0,
        username: m.profiles?.username || 'Unknown' 
      }));
      setMemories(formatted || []);
    }
  };

  useEffect(() => { fetchMemories(); }, [feedMode]);

  useEffect(() => {
    if (leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current).setView([20, 0], 2);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap.current);
    tiles.getContainer().className += ' dark-mode-tiles';
    markersLayer.current = L.layerGroup().addTo(leafletMap.current);
    lineLayer.current = L.polyline([], { color: '#4ecdc4', weight: 4, dashArray: '10, 10' }).addTo(leafletMap.current);
    leafletMap.current.on('click', (e) => window.dispatchEvent(new CustomEvent('map-click', { detail: e.latlng })));
  }, []);

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

  const handleLike = async (memoryId) => {
    const { error } = await supabase.from('likes').insert([{ user_id: session.user.id, memory_id: memoryId }]);
    if (!error) {
      setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, like_count: m.like_count + 1 } : m));
    }
  };

  const saveMemory = async () => {
    if (!tempLocation) return alert("TARGET LOCK REQUIRED: Click Map to Set Coordinates");
    setUploading(true);

    let mediaUrl = null;
    if (form.file) {
      const fileExt = form.file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('memories').upload(fileName, form.file);
      if (error) {
        alert("UPLOAD FAILED: " + error.message);
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
      alert("DATABASE REJECTION: " + error.message);
    } else {
      await fetchMemories();
      leafletMap.current.flyTo([tempLocation[0], tempLocation[1]], 8, { duration: 1.5 });
      setViewYear(year); 
      setIsAddingMode(false);
      setTempLocation(null);
      setForm({ title: "", date: new Date().toISOString().split('T')[0], desc: "", addressQuery: "", file: null });
      leafletMap.current.eachLayer(l => l.options.opacity === 0.5 && leafletMap.current.removeLayer(l));
    }
    setUploading(false);
  };

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
        ${mem.media_url ? `<img src="${mem.media_url}" style="width:100%; border-radius:4px; margin-bottom:8px; border:1px solid #333;" />` : ''}
        <div style="font-size:0.7rem; color:#4ecdc4; margin-bottom:5px;">// AGENT: ${mem.username}</div>
        <strong style="text-transform:uppercase; letter-spacing:1px;">${mem.title}</strong><br/>
        <span style="color:#888; font-size:0.8rem;">DATE: ${mem.date}</span><br/>
        <div style="margin: 5px 0; font-size:0.9rem;">${mem.description || ''}</div>
        <button class="btn-like" id="like-${mem.id}" style="margin-top:5px; background:transparent; border:1px solid #ff0055; color:#ff0055; border-radius:4px; cursor:pointer;">❤️ ${mem.like_count}</button>
      `;

      setTimeout(() => {
         const btn = popupDiv.querySelector(`#like-${mem.id}`);
         if(btn) btn.onclick = () => handleLike(mem.id);
      }, 0);

      L.marker([mem.location_lat, mem.location_lng], { icon }).bindPopup(popupDiv).addTo(markersLayer.current);
    });
    
    if (feedMode === 'mine') {
      lineLayer.current.setLatLngs(active.map(m => [m.location_lat, m.location_lng]));
    }
  }, [viewYear, memories, feedMode]);

  return (
    <div className="app-container">
      <div ref={mapRef} className="map-container" style={{ cursor: isAddingMode ? 'crosshair' : 'grab' }} />

      {!isAddingMode && (
        <div className="ui-layer">
          <h1 className="title">ChronoMap</h1>
          <p className="subtitle">TEMPORAL LOCATOR: {viewYear}</p>
          
          <input type="range" min="2000" max="2030" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} className="time-slider" />
          
          <div className="feed-toggle">
            <button className={feedMode === 'mine' ? 'active' : ''} onClick={() => setFeedMode('mine')}>MY DATA</button>
            <button className={feedMode === 'explore' ? 'active' : ''} onClick={() => setFeedMode('explore')}>GLOBAL NET</button>
          </div>
          
          <button className="btn-primary" onClick={() => setIsAddingMode(true)}>+ NEW ENTRY</button>
          <button className="btn-profile" onClick={() => supabase.auth.signOut()}>[ DISCONNECT ]</button>
        </div>
      )}

      {isAddingMode && (
        <div className="form-overlay">
          <div className="form-card">
            <h2>NEW MEMORY ENTRY</h2>
            <p style={{color: tempLocation?'#4ecdc4':'#ff0055', fontSize:'0.8rem', marginBottom: '15px', fontFamily:'monospace'}}>
              {tempLocation ? ">> COORDINATES LOCKED" : ">> WAITING FOR MAP CLICK..."}
            </p>
            <input type="text" placeholder="DATA_LABEL (TITLE)" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="input-field" />
            <textarea placeholder="LOG_DETAILS (DESCRIPTION)" value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} className="input-field textarea" />
            <input type="file" accept="image/*" onChange={e => setForm({...form, file: e.target.files[0]})} className="input-field" />
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setIsAddingMode(false)}>ABORT</button>
              <button className="btn-save" onClick={saveMemory} disabled={!tempLocation || uploading}>
                {uploading ? "UPLOADING..." : "TRANSMIT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}