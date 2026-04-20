import React from 'react';

export default function IVRBuilder() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', gap: '12px',
      background: '#0f172a', /* Dark background added for new UI */
      borderRadius: '16px',
      height: '100%',
      minHeight: '300px'
    }}>
      <div style={{ fontSize: '32px' }}>🔧</div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: '#e8f0f8' }}>
        IVR Builder
      </div>
      <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', maxWidth: '300px' }}>
        Coming soon — drag and drop IVR flow builder will appear here.
      </div>
    </div>
  );
}