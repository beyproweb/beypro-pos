import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import secureFetch from "../../utils/secureFetch";
import "./CameraTab.css";

export default function CameraTab() {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    hlsUrl: "",
    location: "",
    bitrate: "2500k",
    resolution: "1920x1080",
    enabled: true,
  });

  // Load cameras
  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    setLoading(true);
    try {
      const data = await secureFetch("/api/camera/list");
      setCameras(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("📷 Loading demo cameras...");
      // Demo cameras for development
      setCameras([
        {
          id: "1",
          name: t("Kitchen Camera"),
          hlsUrl: "https://test-streams.mux.dev/x36xhzz/x3izzzyzzde85dt8.m3u8",
          enabled: true,
          location: t("Kitchen"),
          bitrate: "2500k",
          resolution: "1920x1080",
        },
        {
          id: "2",
          name: t("Entrance Camera"),
          hlsUrl: "https://test-streams.mux.dev/x36xhzz/x3izzzyzzde85dt8.m3u8",
          enabled: false,
          location: t("Entrance"),
          bitrate: "1500k",
          resolution: "1280x720",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCamera = async () => {
    if (!formData.name.trim() || !formData.hlsUrl.trim()) {
      toast.error(t("Please fill in all required fields"));
      return;
    }

    setSaving(true);
    try {
      const method = editingCameraId ? "PUT" : "POST";
      const endpoint = editingCameraId
        ? `/api/camera/${editingCameraId}`
        : "/api/camera";

      await secureFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      toast.success(
        editingCameraId
          ? t("Camera updated successfully")
          : t("Camera added successfully")
      );

      resetForm();
      setShowAddModal(false);
      await loadCameras();
    } catch (err) {
      console.error("❌ Save error:", err);
      toast.error(t("Failed to save camera"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCamera = (cameraId) => {
    if (confirm(t("Are you sure you want to delete this camera?"))) {
      setLoading(true);
      secureFetch(`/api/camera/${cameraId}`, { method: "DELETE" })
        .then(() => {
          toast.success(t("Camera deleted successfully"));
          loadCameras();
        })
        .catch((err) => {
          console.error("❌ Delete error:", err);
          toast.error(t("Failed to delete camera"));
          setLoading(false);
        });
    }
  };

  const handleEditCamera = (camera) => {
    setFormData({
      name: camera.name,
      hlsUrl: camera.hlsUrl,
      location: camera.location || "",
      bitrate: camera.bitrate || "2500k",
      resolution: camera.resolution || "1920x1080",
      enabled: camera.enabled !== false,
    });
    setEditingCameraId(camera.id);
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      hlsUrl: "",
      location: "",
      bitrate: "2500k",
      resolution: "1920x1080",
      enabled: true,
    });
    setEditingCameraId(null);
  };

  const handleCloseModal = () => {
    resetForm();
    setShowAddModal(false);
  };

  const handleToggleCamera = (cameraId) => {
    const camera = cameras.find((c) => c.id === cameraId);
    if (!camera) return;

    setSaving(true);
    secureFetch(`/api/camera/${cameraId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...camera, enabled: !camera.enabled }),
    })
      .then(() => {
        setCameras((prev) =>
          prev.map((c) =>
            c.id === cameraId ? { ...c, enabled: !c.enabled } : c
          )
        );
        toast.success(t("Camera status updated"));
      })
      .catch((err) => {
        console.error("❌ Toggle error:", err);
        toast.error(t("Failed to update camera status"));
      })
      .finally(() => setSaving(false));
  };

  const activeCameraCount = cameras.filter((c) => c.enabled).length;

  if (loading && cameras.length === 0) {
    return (
      <div className="camera-tab">
        <div className="camera-loading">
          <div className="spinner"></div>
          <p>{t("Loading cameras")}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-tab">
      {/* Header Section */}
      <div className="camera-header">
        <div className="camera-title-section">
          <h2>{t("Live Cameras")}</h2>
          <p className="camera-subtitle">
            {t("Manage and configure your live camera feeds")}
          </p>
        </div>
        <button
          className="camera-add-btn"
          onClick={() => setShowAddModal(true)}
          disabled={saving}
        >
          <span>➕</span> {t("Add Camera")}
        </button>
      </div>

      {/* Status Card */}
      <div className="camera-status-card">
        <div className="camera-stat">
          <span className="camera-stat-label">{t("Total Cameras")}</span>
          <span className="camera-stat-value">{cameras.length}</span>
        </div>
        <div className="camera-stat">
          <span className="camera-stat-label">{t("Active")}</span>
          <span className="camera-stat-value active">{activeCameraCount}</span>
        </div>
      </div>

      {/* Camera List */}
      {cameras.length === 0 ? (
        <div className="camera-empty-state">
          <div className="camera-empty-icon">📷</div>
          <p>{t("No cameras configured yet")}</p>
          <p className="camera-empty-hint">{t("Add a camera to get started")}</p>
        </div>
      ) : (
        <div className="camera-list">
          {cameras.map((camera) => (
            <div key={camera.id} className="camera-card">
              <div className="camera-card-header">
                <div className="camera-card-title">
                  <h3>{camera.name}</h3>
                  <span className={`camera-status-badge ${camera.enabled ? "active" : "inactive"}`}>
                    {camera.enabled ? "🟢 " : "⚫ "} {camera.enabled ? t("Active") : t("Inactive")}
                  </span>
                </div>
                <div className="camera-card-toggle">
                  <label className="camera-switch">
                    <input
                      type="checkbox"
                      checked={camera.enabled}
                      onChange={() => handleToggleCamera(camera.id)}
                      disabled={saving}
                    />
                    <span className="camera-slider"></span>
                  </label>
                </div>
              </div>

              <div className="camera-card-details">
                {camera.location && (
                  <div className="camera-detail-row">
                    <span className="camera-detail-label">📍 {t("Location")}:</span>
                    <span className="camera-detail-value">{camera.location}</span>
                  </div>
                )}
                <div className="camera-detail-row">
                  <span className="camera-detail-label">🎬 {t("Resolution")}:</span>
                  <span className="camera-detail-value">
                    {camera.resolution || "1920x1080"}
                  </span>
                </div>
                <div className="camera-detail-row">
                  <span className="camera-detail-label">📊 {t("Bitrate")}:</span>
                  <span className="camera-detail-value">
                    {camera.bitrate || "2500k"}
                  </span>
                </div>
                <div className="camera-detail-row">
                  <span className="camera-detail-label">🔗 {t("HLS URL")}:</span>
                  <span className="camera-detail-value camera-url">
                    {camera.hlsUrl.substring(0, 50)}...
                  </span>
                </div>
              </div>

              <div className="camera-card-actions">
                <button
                  className="camera-action-btn edit"
                  onClick={() => handleEditCamera(camera)}
                  disabled={saving}
                  title={t("Edit camera")}
                >
                  ✏️ {t("Edit")}
                </button>
                <button
                  className="camera-action-btn delete"
                  onClick={() => handleDeleteCamera(camera.id)}
                  disabled={saving}
                  title={t("Delete camera")}
                >
                  🗑️ {t("Delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="camera-info-box">
        <div className="camera-info-icon">ℹ️</div>
        <div className="camera-info-content">
          <h4>{t("Tips for Camera Setup")}</h4>
          <ul>
            <li>{t("Use HLS streaming URLs for best compatibility")}</li>
            <li>{t("Recommended resolution: 1920x1080")}</li>
            <li>{t("Typical bitrate: 2500k - 5000k")}</li>
            <li>{t("Test your stream URL before saving")}</li>
          </ul>
        </div>
      </div>

      {/* Modal */}
      {showAddModal && (
        <div className="camera-modal-overlay">
          <div className="camera-modal">
            <div className="camera-modal-header">
              <h3>
                {editingCameraId ? t("Edit Camera") : t("Add New Camera")}
              </h3>
              <button
                className="camera-modal-close"
                onClick={handleCloseModal}
                disabled={saving}
              >
                ✕
              </button>
            </div>

            <div className="camera-modal-content">
              <div className="camera-form-group">
                <label htmlFor="camera-name">{t("Camera Name")}</label>
                <input
                  id="camera-name"
                  type="text"
                  placeholder={t("e.g., Kitchen Camera")}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  disabled={saving}
                />
              </div>

              <div className="camera-form-group">
                <label htmlFor="camera-hls">{t("HLS Stream URL")}</label>
                <input
                  id="camera-hls"
                  type="text"
                  placeholder={t("https://example.com/stream.m3u8")}
                  value={formData.hlsUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, hlsUrl: e.target.value })
                  }
                  disabled={saving}
                />
              </div>

              <div className="camera-form-group">
                <label htmlFor="camera-location">{t("Location")}</label>
                <input
                  id="camera-location"
                  type="text"
                  placeholder={t("e.g., Kitchen, Entrance")}
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  disabled={saving}
                />
              </div>

              <div className="camera-form-row">
                <div className="camera-form-group">
                  <label htmlFor="camera-resolution">{t("Resolution")}</label>
                  <select
                    id="camera-resolution"
                    value={formData.resolution}
                    onChange={(e) =>
                      setFormData({ ...formData, resolution: e.target.value })
                    }
                    disabled={saving}
                  >
                    <option value="1280x720">1280x720 (HD)</option>
                    <option value="1920x1080">1920x1080 (Full HD)</option>
                    <option value="2560x1440">2560x1440 (2K)</option>
                    <option value="3840x2160">3840x2160 (4K)</option>
                  </select>
                </div>

                <div className="camera-form-group">
                  <label htmlFor="camera-bitrate">{t("Bitrate")}</label>
                  <select
                    id="camera-bitrate"
                    value={formData.bitrate}
                    onChange={(e) =>
                      setFormData({ ...formData, bitrate: e.target.value })
                    }
                    disabled={saving}
                  >
                    <option value="1000k">1000 kbps</option>
                    <option value="1500k">1500 kbps</option>
                    <option value="2500k">2500 kbps</option>
                    <option value="5000k">5000 kbps</option>
                  </select>
                </div>
              </div>

              <div className="camera-form-group camera-checkbox-group">
                <label className="camera-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) =>
                      setFormData({ ...formData, enabled: e.target.checked })
                    }
                    disabled={saving}
                  />
                  <span>{t("Enable this camera")}</span>
                </label>
              </div>
            </div>

            <div className="camera-modal-footer">
              <button
                className="camera-btn-cancel"
                onClick={handleCloseModal}
                disabled={saving}
              >
                {t("Cancel")}
              </button>
              <button
                className="camera-btn-save"
                onClick={handleAddCamera}
                disabled={saving}
              >
                {saving ? t("Saving...") : t("Save Camera")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
