import React, { useEffect, useState } from 'react';
import { Phone, MicOff, Volume2, CheckCircle, Zap, Shield, TrendingUp } from 'lucide-react';
import '../../phone-mockup.css';

const PhoneMockup = () => {
  const [timer, setTimer] = useState(47);

  // Update timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `0${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const waveformHeights = [12, 24, 32, 28, 40, 32, 24, 28, 36, 32, 20, 16, 12];

  return (
    <div className="phone-mockup-container">
      {/* Floating Card 1 - Top Right */}
      <div className="floating-stat float-booking">
        <div className="bg-green-light">
          <CheckCircle className="text-green" size={14} />
        </div>
        <div>
          <span className="sc-title">Booking confirmed</span>
          <span className="sc-time">Just now</span>
        </div>
      </div>

      {/* Floating Card 2 - Left Middle */}
      <div className="floating-stat float-revenue">
        <div className="sc-label">REVENUE</div>
        <div className="sc-val">$12,450</div>
        <div className="sc-sub">This week</div>
      </div>

      {/* Floating Card 3 - Bottom Left */}
      <div className="floating-stat float-calls">
        <div className="sc-label">TODAY'S CALLS</div>
        <div className="sc-val-row">
          <span className="sc-val" style={{ margin: 0, color: 'var(--primary)' }}>47</span>
          <span className="sc-trend text-green">↑ 23%</span>
        </div>
      </div>

      <div className="phone-frame">
        <div className="phone-screen">
          <div className="phone-screen-bg">
            {/* Dynamic Island */}
            <div className="dynamic-island">
              <div className="island-dot" style={{ opacity: 0.3 }}></div>
              <div className="island-dot"></div>
              <div className="island-dot" style={{ opacity: 0.3 }}></div>
            </div>

            <div className="phone-status-bar">
              <span>9:41</span>
              <div className="status-icons">
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  <div style={{ width: 3, height: 6, background: '#000', borderRadius: 1 }}></div>
                  <div style={{ width: 3, height: 9, background: '#000', borderRadius: 1 }}></div>
                  <div style={{ width: 3, height: 12, background: '#000', borderRadius: 1, opacity: 0.2 }}></div>
                </div>
                <div style={{ width: 22, height: 11, border: '1.5px solid #000', borderRadius: 3, padding: 1, display: 'flex' }}>
                   <div style={{ width: '70%', height: '100%', background: '#000', borderRadius: 1 }}></div>
                </div>
              </div>
            </div>

            <div className="call-ui">
              <div className="caller-avatar">SJ</div>
              <h3 className="caller-name">Sarah Johnson</h3>
              <p className="caller-route">NYC → Miami • $2,450</p>
              
              <div className="audio-waveform">
                {waveformHeights.map((h, i) => (
                  <div key={i} className="waveform-bar" style={{ height: h }}></div>
                ))}
              </div>

              <div className="timer-pill">
                <div className="dot"></div>
                <span>{formatTime(timer)}</span>
              </div>

              <div className="ai-message-card">
                <div className="ai-icon-box">
                  <Zap size={20} fill="white" />
                </div>
                <div className="ai-message-text">
                  "Great! I've confirmed your move for January 15th. You'll receive a confirmation email shortly..."
                </div>
              </div>
            </div>
          </div>
          <div className="home-indicator"></div>
        </div>
      </div>
    </div>
  );
};

export default PhoneMockup;
