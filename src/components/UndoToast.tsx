'use client'

import { useEffect } from 'react'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export default function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#fff', borderRadius: '10px',
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)', zIndex: 9999, fontSize: '14px',
      whiteSpace: 'nowrap',
    }}>
      <span>{message}</span>
      <button
        onClick={onUndo}
        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 2px' }}
      >
        ×
      </button>
    </div>
  )
}
