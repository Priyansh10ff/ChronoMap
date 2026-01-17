import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Auth({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isPrivate, setIsPrivate] = useState(false); 

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert("CRITICAL ERROR: " + error.message);
      } else if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, username, is_private: isPrivate }]);
        
        if (profileError) {
            console.error(profileError);
            alert("System Error: Profile creation failed. " + profileError.message);
        } else {
          alert("Identity Established. Please Log In.");
          setIsSignUp(false); 
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert("ACCESS DENIED: " + error.message);
      else onLogin(data.session);
    }
    setLoading(false);
  };

  return (
    <div className="cyber-container">
      {/* BACKGROUND DECORATIONS */}
      <div className="retro-grid"></div>
      <div className="scan-line"></div>
      
      <div className="cyber-card">
        <h1 className="glitch-title" data-text="ChronoMap">ChronoMap</h1>
        <p className="cyber-subtitle">
          {isSignUp ? ">> NEW IDENTITY PROTOCOL" : ">> SYSTEM LOGIN REQUIRED"}
        </p>

        {/* --- MISSION BRIEFING PANEL --- */}
        {isSignUp && (
          <div className="info-terminal">
            <p className="terminal-header">/// MISSION PARAMETERS ///</p>
            <div className="terminal-body">
               <p className={!isPrivate ? "active-mode" : "muted-mode"}>
                 [🌍 PUBLIC]: Your memories are broadcast to the Global Feed. Travelers worldwide can witness your journey.
               </p>
               <p className={isPrivate ? "active-mode" : "muted-mode"}>
                 [🔒 PRIVATE]: Stealth Mode engaged. Your map is encrypted and visible ONLY to you.
               </p>
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} className="cyber-form">
          {isSignUp && (
            <div className="input-wrapper">
              <input className="cyber-input" type="text" placeholder="CODENAME (USERNAME)" value={username} onChange={e=>setUsername(e.target.value)} required />
            </div>
          )}
          
          <div className="input-wrapper">
            <input className="cyber-input" type="email" placeholder="NET-ID (EMAIL)" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          
          <div className="input-wrapper">
            <input className="cyber-input" type="password" placeholder="ACCESS KEY (PASSWORD)" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>

          {isSignUp && (
            <div className="privacy-selector">
              <label className={`cyber-option ${!isPrivate ? 'selected' : ''}`} onClick={() => setIsPrivate(false)}>
                🌍 PUBLIC
              </label>
              <label className={`cyber-option ${isPrivate ? 'selected-private' : ''}`} onClick={() => setIsPrivate(true)}>
                🔒 PRIVATE
              </label>
            </div>
          )}

          <button className="cyber-btn" disabled={loading}>
            {loading ? "PROCESSING..." : isSignUp ? "INITIATE SEQUENCE" : "CONNECT"}
          </button>
        </form>

        <button className="switch-btn" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? "[ ABORT REGISTRATION ]" : "[ CREATE NEW IDENTITY ]"}
        </button>
      </div>
    </div>
  );
}