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
      // 1. SIGN UP
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
      } else if (data.user) {
        // 2. CREATE PROFILE ROW
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, username, is_private: isPrivate }]);
        
        if (profileError) {
            console.error(profileError); // Log error for debugging
            alert("Account created, but profile setup failed. " + profileError.message);
        } else {
          alert("Account created! You can now log in.");
          setIsSignUp(false); 
        }
      }
    } else {
      // LOGIN
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
      else onLogin(data.session);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">ChronoMap</h1>
        <p className="auth-subtitle">{isSignUp ? "Join the Network" : "Welcome Back"}</p>

        <form onSubmit={handleAuth} className="auth-form">
          {isSignUp && (
            <input className="input-field" type="text" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} required />
          )}
          <input className="input-field" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="input-field" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />

          {isSignUp && (
            <div className="privacy-toggle">
              <label style={{display:'flex', alignItems:'center', cursor:'pointer'}}>
                <input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)} style={{marginRight:'10px'}}/>
                <span className="toggle-label">🔒 Private Account</span>
              </label>
              <p className="toggle-hint">{isPrivate ? "Only you can see your map." : "Your map is visible to the world."}</p>
            </div>
          )}

          <button className="btn-save" disabled={loading}>
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Log In"}
          </button>
        </form>

        <button className="btn-link" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? "Have an account? Log In" : "New here? Create Account"}
        </button>
      </div>
    </div>
  );
}