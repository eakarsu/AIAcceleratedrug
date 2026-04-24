import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export default function CrudPage({ config }) {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAll(config.resource);
      setItems(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [config.resource]);

  useEffect(() => {
    loadItems();
    setSelectedItem(null);
    setShowForm(false);
    setEditItem(null);
    setSearch('');
  }, [config.resource, loadItems]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = () => {
    setEditItem(null);
    setFormData({});
    setShowForm(true);
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setFormData({ ...item });
    setShowForm(true);
    setSelectedItem(null);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name || item.compound_name || item.title || item.drug_a || 'this item'}"?`)) return;
    try {
      await api.delete(config.resource, item.id);
      showToast('Deleted successfully');
      loadItems();
      setSelectedItem(null);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editItem) {
        await api.update(config.resource, editItem.id, formData);
        showToast('Updated successfully');
      } else {
        await api.create(config.resource, formData);
        showToast('Created successfully');
      }
      setShowForm(false);
      loadItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRowClick = (item) => {
    setSelectedItem(item);
  };

  const filteredItems = items.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return Object.values(item).some((v) => v && String(v).toLowerCase().includes(s));
  });

  const formatFieldLabel = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const formatValue = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number' && val > 100000) return `$${(val / 1000000).toFixed(1)}M`;
    return String(val);
  };

  // Detail View
  if (selectedItem) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">{config.title}</h1>
            <p className="page-subtitle">{config.subtitle}</p>
          </div>
        </div>
        <div className="page-body">
          <div className="detail-view">
            <button className="back-btn" onClick={() => setSelectedItem(null)}>
              ← Back to list
            </button>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {selectedItem.name || selectedItem.compound_name || selectedItem.title || `${selectedItem.drug_a} + ${selectedItem.drug_b}`}
                </h3>
                <div className="btn-group">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(selectedItem)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedItem)}>Delete</button>
                </div>
              </div>
              <div className="card-body">
                <div className="detail-grid">
                  {config.fields.map((field) => (
                    <div key={field.key} className="detail-field" style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : {}}>
                      <div className="detail-field-label">{field.label}</div>
                      <div className="detail-field-value">
                        {config.badgeField === field.key ? (
                          <span className={`badge ${(config.badgeMap || {})[selectedItem[field.key]] || 'badge-secondary'}`}>
                            {selectedItem[field.key] || '—'}
                          </span>
                        ) : (
                          formatValue(selectedItem[field.key])
                        )}
                      </div>
                    </div>
                  ))}
                  {selectedItem.ai_output && (
                    <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                      <div className="detail-field-label">AI Output</div>
                      <div className="ai-output" style={{ marginTop: '8px' }}>
                        <div className="ai-output-header">
                          <div className="ai-icon">AI</div>
                          <h4>AI Analysis</h4>
                        </div>
                        <div className="ai-output-content">{selectedItem.ai_output}</div>
                      </div>
                    </div>
                  )}
                  <div className="detail-field">
                    <div className="detail-field-label">Created At</div>
                    <div className="detail-field-value">{selectedItem.created_at ? new Date(selectedItem.created_at).toLocaleString() : '—'}</div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-field-label">Updated At</div>
                    <div className="detail-field-value">{selectedItem.updated_at ? new Date(selectedItem.updated_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{config.title}</h1>
          <p className="page-subtitle">{config.subtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>+ New Item</button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ color: '#64748b', fontSize: '13px' }}>{filteredItems.length} items</span>
        </div>

        <div className="card">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {(config.columns || config.fields.slice(0, 4).map(f => f.key)).map((col) => (
                    <th key={col}>{formatFieldLabel(col)}</th>
                  ))}
                  <th style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={999} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                      {loading ? 'Loading...' : 'No items found'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} onClick={() => handleRowClick(item)}>
                      {(config.columns || config.fields.slice(0, 4).map(f => f.key)).map((col, ci) => (
                        <td key={col} className={ci === 0 ? 'cell-primary' : ''}>
                          {config.badgeField === col ? (
                            <span className={`badge ${(config.badgeMap || {})[item[col]] || 'badge-secondary'}`}>
                              {item[col] || '—'}
                            </span>
                          ) : (
                            formatValue(item[col])
                          )}
                        </td>
                      ))}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="btn-group">
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editItem ? 'Edit Item' : 'New Item'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {config.fields.map((field) => (
                  <div className="form-group" key={field.key}>
                    <label className="form-label">{field.label}</label>
                    {field.type === 'textarea' ? (
                      <textarea
                        className="form-textarea"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        required={field.required}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        className="form-select"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || 'text'}
                        className="form-input"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        required={field.required}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editItem ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </>
  );
}
