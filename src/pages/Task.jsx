import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppearance } from "../context/AppearanceContext";
import axios from "axios";
import socket from "../utils/socket"; // adjust path as needed!
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import i18n from "i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
const API_URL = import.meta.env.VITE_API_URL || "";


export default function Task() {
  const { t } = useTranslation();
  const { darkMode, fontSize, fontFamily } = useAppearance();
  const [showManualModal, setShowManualModal] = useState(false);

  const [staffList, setStaffList] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Manual add form state
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualAssignedTo, setManualAssignedTo] = useState("");
  const [manualDueAt, setManualDueAt] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editedTask, setEditedTask] = useState({});
   // Only allow users with "settings" permission
const hasDashboardAccess = useHasPermission("dashboard");
if (!hasDashboardAccess) {
  return (
    <div className="p-12 text-2xl text-red-600 text-center">
      {t("Access Denied: You do not have permission to view the Dashboard.")}
    </div>
  );
}


const getSpeechText = (key, lang = "en") => {
  const phrases = {
    start: {
      en: "Hello, please assign a task.",
      tr: "Merhaba, lütfen bir görev verin.",
      de: "Hallo, bitte eine Aufgabe zuweisen."
    },
    missing_fields: {
      en: "Time and staff name are required to save the task",
      tr: "Görevi kaydetmek için zaman ve personel adı gerekli",
      de: "Zeit und Mitarbeitername sind erforderlich, um die Aufgabe zu speichern"
    },
    missing_fields_example: {
      en: "Example: 'Assign cleaning to Yusuf at 4 PM'",
      tr: "Örnek: 'Yusuf mutfağı saat dörtte temizlesin'",
      de: "Beispiel: 'Yusuf soll die Küche um 16 Uhr putzen'"
    },
    saved: {
      en: "✅ Task saved.",
      tr: "✅ Görev kaydedildi.",
      de: "✅ Aufgabe gespeichert."
    },
    error: {
      en: "Something went wrong.",
      tr: "Bir şeyler ters gitti.",
      de: "Etwas ist schiefgelaufen."
    }
  };

  return phrases[key]?.[lang] || phrases[key]?.en || "";
};


const getLangVoiceCode = (lang) => {
  return lang === "tr" ? "tr-TR"
       : lang === "de" ? "de-DE"
       : lang === "fr" ? "fr-FR"
       : "en-US";
};


const currentLang = i18n.language || "en";
const langVoiceCode = getLangVoiceCode(currentLang);



  // Speech setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;
  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
  }

  const extractName = (text) => {
    const m = text.match(/to\s+(.+?)($|\s+at)/i);
    return m ? m[1].trim() : text.trim();
  };

// Helper to pad numbers like 4 → "04"
const pad = (n) => String(n).padStart(2, "0");

const toLocalISOString = (date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const extractTimeFromTurkish = (text) => {
  const now = new Date();
  let dayOffset = 0;

  if (/yarın/i.test(text)) dayOffset = 1;

  const isEvening = /akşam|gece/i.test(text);
  const isMorning = /sabah|öğlen|öğle/i.test(text);

  const match = text.match(/saat\s+(\d{1,2})(?:[:.](\d{1,2}))?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;

  // 🔁 Guess PM if hour is 4-7 and no morning indicators
  if (!isMorning && !isEvening && hour >= 4 && hour <= 7) {
    hour += 12;
  }

  if (isEvening && hour < 12) hour += 12;
  if (/gece/i.test(text) && hour <= 5) hour += 24;

  now.setDate(now.getDate() + dayOffset);
  now.setHours(hour % 24, minute, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};


const extractTimeFromGerman = (text) => {
  const now = new Date();
  let dayOffset = 0;
  if (/morgen/i.test(text)) dayOffset = 1;

  const isEvening = /abend|nacht/i.test(text);
  const isMorning = /morgen|vormittag/i.test(text);

  const match = text.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;

  if (isEvening && hour < 12) hour += 12;

  now.setDate(now.getDate() + dayOffset);
  now.setHours(hour % 24, minute, 0, 0);
const pad = (n) => String(n).padStart(2, "0");
return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

};

const extractTimeFromFrench = (text) => {
  const now = new Date();
  let dayOffset = 0;
  if (/demain/i.test(text)) dayOffset = 1;

  const isEvening = /soir|nuit/i.test(text);
  const isMorning = /matin/i.test(text);

  const match = text.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;

  if (isEvening && hour < 12) hour += 12;

  now.setDate(now.getDate() + dayOffset);
  now.setHours(hour % 24, minute, 0, 0);
  return toLocalISOString(now);
};

const extractTimeFromText = (text, lang = "en") => {
  const now = new Date();

  if (lang === "tr") return extractTimeFromTurkish(text);
  if (lang === "de") return extractTimeFromGerman(text);
  if (lang === "fr") return extractTimeFromFrench(text);

  // Default: English with AM/PM
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = match[3]?.toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;

  now.setHours(hour, minute, 0, 0);
  return toLocalISOString(now);
};




  const speak = (text, cb, lang = "en-US") => {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.85;          // ✅ Slower (0.5–2.0 range, default = 1)
  u.pitch = 1;            // Optional: you can set 0.9 for deeper tone
  u.volume = 1;           // Max volume

  // Optional: pick a non-default voice
  const voices = speechSynthesis.getVoices();
  const match = voices.find(v => v.lang === lang);
  if (match) u.voice = match;

  if (cb) u.onend = cb;
  speechSynthesis.speak(u);
};


const speakAndRestart = (text, lang = "en-US") => {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.onend = () => {
    try {
      recognition.start();
    } catch (err) {
      console.error("❌ Failed to restart mic:", err);
    }
  };
  speechSynthesis.speak(u);
};




  // Initial load
  useEffect(() => {
    axios.get(`${API_URL}/api/tasks`)
      .then(res => setTasks(res.data))
      .catch(() => toast.error('Error fetching tasks'))
      .finally(() => setLoading(false));
    axios.get(`${API_URL}/api/staff`)
      .then(res => setStaffList(res.data))
      .catch(() => toast.error('Error fetching staff'));
  }, []);

  // Socket updates
  useEffect(() => {
    socket.on('task_created', nt => setTasks(p => [nt, ...p]));
    socket.on('task_updated', ut => setTasks(p => p.map(t => t.id === ut.id ? ut : t)));
    return () => {
      socket.off('task_created');
      socket.off('task_updated');
    };
  }, []);

 useEffect(() => {
  socket.on("tasks_cleared_completed", () => {
    setTasks(t => t.filter(task => task.status !== "completed"));
  });
  return () => socket.off("tasks_cleared_completed");
}, []);


  // Handle initial speech result
const handleRecognition = async (event) => {
  const text = event.results[0][0].transcript.trim();
  console.log("🎙️ Recognized:", text);

  const currentLang = i18n.language || "en";
  const langVoiceCode = currentLang === "tr" ? "tr-TR"
                        : currentLang === "de" ? "de-DE"
                        : currentLang === "fr" ? "fr-FR"
                        : "en-US";

  setIsProcessingVoice(true);
  try {
    const res = await axios.post("/api/voice-command", {
      message: text,
      created_by: 425425,
    }, {
      headers: {
        "x-client-lang": currentLang
      }
    });

    const { status, parsed } = res.data;

    if (status === "saved") {
      speak(getSpeechText("saved", currentLang), null, langVoiceCode);
} else if (status === "missing_fields") {
  // 👇 Try to manually complete missing fields
  const dueISO = extractTimeFromText(text, currentLang);
  const staffGuess = staffList.find(s => text.toLowerCase().includes(s.name.toLowerCase()));
  const assignedName = staffGuess?.name;

  if (parsed?.title && dueISO && assignedName) {
    const taskPayload = {
      title: parsed.title,
      description: parsed.description || "",
      assigned_to_name: assignedName,
      due_at: dueISO, // ✅ override with frontend-parsed time
      created_by: 425425,
      input_method: "voice",
      voice_response: true,
    };

    try {
      const r = await axios.post("/api/tasks", taskPayload);
      setTasks(t => [r.data, ...t]);
      speak(getSpeechText("saved", currentLang), null, langVoiceCode);
    } catch (e) {
      console.error("❌ Failed to save manually completed task", e);
      toast.error("Failed to save manually completed task.");
      speak(getSpeechText("error", currentLang), null, langVoiceCode);
    }

    return;
  }

  // ❌ Still incomplete → retry mic
  speakAndRestart(
    `${getSpeechText("missing_fields", currentLang)}. ${getSpeechText("missing_fields_example", currentLang)}`,
    langVoiceCode
);

} else {
  speak(getSpeechText("error", currentLang), null, langVoiceCode);
}

  } catch (err) {
    console.error("❌ Voice-task error:", err);
    toast.error("Failed to process speech.");
    speak(getSpeechText("error", currentLang), null, langVoiceCode);
  } finally {
    setIsProcessingVoice(false);
  }
};


const startVoiceRecognition = () => {
  if (!recognition) return;

  const currentLang = i18n.language || "en";
  const langVoiceCode = currentLang === "tr" ? "tr-TR"
                        : currentLang === "de" ? "de-DE"
                        : currentLang === "fr" ? "fr-FR"
                        : "en-US";
  recognition.lang = langVoiceCode;
  setIsProcessingVoice(true);
  speak(getSpeechText("start", currentLang), () => {
    try {
      recognition.onresult = handleRecognition;
      recognition.onerror = (e) => {
        console.error("🎤 Mic error:", e.error);
        setIsProcessingVoice(false);
        speak(getSpeechText("error", currentLang), null, langVoiceCode);
      };
      recognition.start();
    } catch (e) {
      console.warn("❌ Could not start mic:", e);
      setIsProcessingVoice(false);
    }
  }, langVoiceCode);
};




  // Manual submit
  const handleManualSubmit = async () => {
  if (!manualTitle || !manualAssignedTo || !manualDueAt) {
    return toast.warn('Please fill title, assignee, and due date');
  }

  try {
    const isoDue = new Date(manualDueAt).toISOString();
    await axios.post(`${API_URL}/api/tasks`, {
      title: manualTitle,
      description: manualDescription,
      assigned_to_name: staffList.find(s => s.id === +manualAssignedTo)?.name,
      due_at: isoDue,
      created_by: 425425,
      input_method: 'manual'
    });

    // ✅ Let socket handle adding the task — no duplication
    toast.success('Task added');
    setManualTitle("");
    setManualDescription("");
    setManualAssignedTo("");
    setManualDueAt("");
  } catch (e) {
    console.error(e);
    toast.error('Could not add task');
  }
};


  const handleStartTask = async (id) => {
    try {
      const r = await axios.patch(`/api/tasks/${id}/start`);
      toast.success("Task started!");
      setTasks(p => p.map(t => t.id === id ? r.data : t));
    } catch {
      toast.error("Failed to start task");
    }
  };
  const handleCompleteTask = async (id) => {
    try {
      const r = await axios.patch(`/api/tasks/${id}/complete`);
      toast.success("Task completed!");
      setTasks(p => p.map(t => t.id === id ? r.data : t));
    } catch {
      toast.error("Failed to complete task");
    }
  };
  const formatDuration = (s, e = new Date()) => {
    const ms = new Date(e) - new Date(s);
    return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
  };

  const clearTasks = async () => {
  try {
    const res = await axios.delete("/api/tasks/clear-completed");
    const count = res.data.count || 0;

    setTasks(prev =>
      Array.isArray(prev)
        ? prev.filter(task => task && task.status !== "completed")
        : []
    );

    toast.success(`✅ Cleared ${count} completed task${count === 1 ? "" : "s"}.`);
  } catch (err) {
    console.error("❌ Failed to clear completed tasks", err);
    toast.error("Failed to clear completed tasks");
  }
};





  const handleSaveEdit = async (taskId) => {
  try {
    const payload = {
      title: editedTask.title?.trim(),
      description: editedTask.description?.trim() || "",
      assigned_to: editedTask.assigned_to || null,
      due_at: editedTask.due_at || null,
      priority: editedTask.priority || "medium",
      station: editedTask.station || null,
    };

    // Ensure title exists before sending
    if (!payload.title) {
      toast.warning(t("Task title is required."));
      return;
    }

    const res = await axios.put(`/api/tasks/${taskId}`, payload);
    const updatedTask = res.data;

    const updated = tasks.map((t) =>
      t.id === taskId ? updatedTask : t
    );
    setTasks(updated);
    setEditingTaskId(null);
    setEditedTask({});
    toast.success(t("Task updated!"));
  } catch (err) {
    console.error("❌ Failed to update task", err);
    toast.error(t("Failed to save task"));
  }
};



  return (
  <div
    className={`min-h-screen px-4 py-4 ${
      darkMode ? "bg-black text-white" : "bg-gradient-to-br from-white-100 to-white text-black"
    }`}
    style={{
      fontSize: fontSize || "0.95rem",
      fontFamily: fontFamily || "Inter, sans-serif",
    }}
  >


    {/* Controls */}
    <div className="flex flex-wrap justify-center gap-4 mb-10">
      <button
        onClick={startVoiceRecognition}
        disabled={isProcessingVoice}
        className="px-5 py-2.5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white text-base font-medium shadow-md hover:scale-105 transition-all disabled:opacity-50"
      >
        🎤 {t("Speak Task")}
      </button>
      <button
        onClick={() => setShowManualModal(true)}
        className="px-5 py-2.5 rounded-full bg-gradient-to-br from-green-500 to-teal-600 text-white text-base font-medium shadow-md hover:scale-105 transition-all"
      >
        ➕ {t("Add Task")}
      </button>
      <button
        onClick={clearTasks}
        className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-semibold shadow hover:bg-red-600"
      >
        🧹 {t("Clear Tasks")}
      </button>
    </div>

    {/* Task List */}
    {loading ? (
      <p className="text-center text-sm text-gray-500 animate-pulse">{t("Loading tasks...")}</p>
    ) : (
      <div className="grid gap-5 max-w-4xl mx-auto">
        {tasks.map((task, idx) => {
  const staff = staffList.find((s) => s.id === task.assigned_to);
  const isEditing = editingTaskId === task.id;
  const completed = task.status === "completed";
  const inProgress = task.status === "in_progress";

  return (
    <div
      key={`${task.id}-${idx}`}
      className={`rounded-xl shadow border p-4 transition-all ${
        completed
          ? "bg-green-100 dark:bg-green-900 border-green-400"
          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
      }`}
    >
      {/* Title */}
      {isEditing ? (
        <input
          className="w-full text-lg font-bold mb-1 p-1 rounded border bg-white dark:bg-black"
          value={editedTask.title}
          onChange={(e) =>
            setEditedTask((prev) => ({ ...prev, title: e.target.value }))
          }
        />
      ) : (
        <h2 className="text-lg font-bold mb-1">{task.title}</h2>
      )}

      {/* Description */}
      {isEditing ? (
        <textarea
          className="w-full text-sm mb-2 p-1 rounded border bg-white dark:bg-black"
          value={editedTask.description}
          onChange={(e) =>
            setEditedTask((prev) => ({ ...prev, description: e.target.value }))
          }
        />
      ) : (
        task.description && (
          <p className="text-sm opacity-70 mb-1">{task.description}</p>
        )
      )}

      {/* Due Date */}
   <p className="text-xs mb-1">
  ⏰ {t("Due")}:{" "}
  {isEditing ? (
    <input
      type="datetime-local"
      value={editedTask.due_at}
      onChange={(e) =>
        setEditedTask((prev) => ({ ...prev, due_at: e.target.value }))
      }
      className="p-1 text-xs border rounded bg-white dark:bg-black"
    />
  ) : (
    new Date(task.due_at).toLocaleString("tr-TR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

  )}
</p>

      {/* Assigned To */}
      <p className="text-xs mb-1">
        🙋 {t("Assigned to")}:{" "}
        {isEditing ? (
          <select
            value={editedTask.assigned_to}
            onChange={(e) =>
              setEditedTask((prev) => ({
                ...prev,
                assigned_to: e.target.value,
              }))
            }
            className="text-xs p-1 border rounded bg-white dark:bg-black"
          >
            <option value="">{t("Assign to...")}</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          staff?.name || "-"
        )}
      </p>

      <p className="text-xs">🔁 {t("Status")}: {t(task.status)}</p>

      {inProgress && task.started_at && !completed && (
        <p className="text-xs text-yellow-500 mt-1">
          ⏱️ {t("Elapsed")}: {formatDuration(task.started_at)}
        </p>
      )}

      <div className="flex gap-2 mt-3 flex-wrap">
        {!completed && !isEditing && (
          <>
            {!inProgress ? (
              <button
                onClick={() => handleStartTask(task.id)}
                className="px-3 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-bold"
              >
                ✅ {t("Accept Task")}
              </button>
            ) : (
              <button
                onClick={() => handleCompleteTask(task.id)}
                className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-bold"
              >
                ✔️ {t("Complete Task")}
              </button>
            )}
            <button
              onClick={() => {
                setEditingTaskId(task.id);
                setEditedTask({
                  title: task.title,
                  description: task.description,
                  due_at: task.due_at?.slice(0, 16), // trim for datetime-local
                  assigned_to: task.assigned_to,
                });
              }}
              className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm"
            >
              ✏️ {t("Edit")}
            </button>
          </>
        )}

        {isEditing && (
          <>
            <button
              onClick={() => handleSaveEdit(task.id)}
              className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-sm"
            >
              💾 {t("Save")}
            </button>
            <button
              onClick={() => setEditingTaskId(null)}
              className="px-3 py-1 rounded bg-gray-400 hover:bg-gray-500 text-white text-sm"
            >
              ❌ {t("Cancel")}
            </button>
          </>
        )}
      </div>
    </div>
  );
})}

      </div>
    )}

    {/* Modal for Manual Task */}
    {showManualModal && (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <div className={`w-full max-w-xl p-6 rounded-2xl shadow-lg relative border ${darkMode ? "bg-white/10 border-white/20 text-white" : "bg-white text-black"}`}>
          <button
            onClick={() => setShowManualModal(false)}
            className="absolute top-3 right-3 text-xl font-bold hover:text-red-500"
          >
            ✖
          </button>
          <h2 className="text-2xl font-bold mb-4 text-center">{t("Add Task Manually")}</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder={t("Task Title")}
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              className="w-full p-2.5 border rounded-lg bg-gray-100 dark:bg-white/10 dark:border-gray-600"
            />
            <textarea
              placeholder={t("Description (optional)")}
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              className="w-full p-2.5 border rounded-lg h-20 bg-gray-100 dark:bg-white/10 dark:border-gray-600"
            />
            <div className="flex gap-3 flex-col md:flex-row">
              <select
                value={manualAssignedTo}
                onChange={(e) => setManualAssignedTo(e.target.value)}
                className="flex-1 p-2.5 border rounded-lg bg-gray-100 dark:bg-white/10 dark:border-gray-600"
              >
                <option value="">{t("Assign to...")}</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={manualDueAt}
                onChange={(e) => setManualDueAt(e.target.value)}
                className="flex-1 p-2.5 border rounded-lg bg-gray-100 dark:bg-white/10 dark:border-gray-600"
              />
            </div>
            <button
              onClick={() => {
                handleManualSubmit();
                setShowManualModal(false);
              }}
              className="w-full py-2.5 mt-2 bg-gradient-to-br from-green-500 to-teal-600 text-white rounded-full font-semibold shadow hover:scale-[1.03] transition"
            >
              ➕ {t("Add Task")}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);



}
