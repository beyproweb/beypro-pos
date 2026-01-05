import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppearance } from "../context/AppearanceContext";
import socket from "../utils/socket"; // adjust path as needed!
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import i18n from "i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import secureFetch from "../utils/secureFetch";
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
  const [activeStaffId, setActiveStaffId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
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
      de: "Hallo, bitte eine Aufgabe zuweisen.",
      fr: "Bonjour, veuillez attribuer une tâche."
    },
    missing_fields: {
      en: "Time and staff name are required to save the task",
      tr: "Görevi kaydetmek için zaman ve personel adı gerekli",
      de: "Zeit und Mitarbeitername sind erforderlich, um die Aufgabe zu speichern",
      fr: "L’heure et le nom du personnel sont requis pour enregistrer la tâche"
    },
    missing_fields_example: {
      en: "Example: 'Assign cleaning to Yusuf at 4 PM'",
      tr: "Örnek: 'Yusuf mutfağı saat dörtte temizlesin'",
      de: "Beispiel: 'Yusuf soll die Küche um 16 Uhr putzen'",
      fr: "Exemple : « Assigner le nettoyage à Yusuf à 16h »"
    },
    saved: {
      en: "✅ Task saved.",
      tr: "✅ Görev kaydedildi.",
      de: "✅ Aufgabe gespeichert.",
      fr: "✅ Tâche enregistrée."
    },
    error: {
      en: "Something went wrong.",
      tr: "Bir şeyler ters gitti.",
      de: "Etwas ist schiefgelaufen.",
      fr: "Une erreur s’est produite."
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

  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const currentUtteranceRef = useRef(null);
  const voiceRef = useRef(null);
  const lastTranscriptRef = useRef("");

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    currentUtteranceRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onstart = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch (err) {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    let mounted = true;

    const assignVoice = () => {
      if (!mounted) return;
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const exact = voices.find((v) => v.lang === langVoiceCode);
      const baseMatch = voices.find((v) =>
        v.lang.toLowerCase().startsWith(langVoiceCode.split("-")[0].toLowerCase())
      );
      voiceRef.current = exact || baseMatch || voices[0];
    };

    assignVoice();
    window.speechSynthesis.addEventListener("voiceschanged", assignVoice);
    return () => {
      mounted = false;
      window.speechSynthesis.removeEventListener("voiceschanged", assignVoice);
    };
  }, [langVoiceCode]);

  const speakText = useCallback(
    (text, { lang, rate = 0.9, onComplete } = {}) => {
      if (!text) {
        onComplete?.();
        return;
      }

      if (typeof window === "undefined" || !window.speechSynthesis) {
        onComplete?.();
        return;
      }

      cancelSpeech();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || langVoiceCode;
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;

      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }

      utterance.onend = () => {
        currentUtteranceRef.current = null;
        onComplete?.();
      };
      utterance.onerror = () => {
        currentUtteranceRef.current = null;
        onComplete?.();
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [cancelSpeech, langVoiceCode]
  );

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (err) {
      // ignore
    }
    listeningRef.current = false;
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      if (listeningRef.current && typeof recognition.abort === "function") {
        recognition.abort();
      }
      recognition.lang = langVoiceCode;
      recognition.start();
    } catch (err) {
      console.error("🎤 Could not start mic:", err);
      setIsProcessingVoice(false);
    }
  }, [langVoiceCode]);

  const promptAndListen = useCallback(
    (text, lang = langVoiceCode) => {
      setIsProcessingVoice(true);
      speakText(text, {
        lang,
        onComplete: () => {
          startListening();
        },
      });
    },
    [speakText, startListening, langVoiceCode, setIsProcessingVoice]
  );

  // Initial load
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const [tasksData, staffData] = await Promise.all([
          secureFetch("/tasks").catch((err) => {
            console.error("❌ Failed to fetch tasks", err);
            throw err;
          }),
          secureFetch("/staff").catch((err) => {
            console.error("❌ Failed to fetch staff", err);
            throw err;
          }),
        ]);

        if (!isMounted) return;
        setTasks(Array.isArray(tasksData) ? tasksData : []);
        setStaffList(Array.isArray(staffData) ? staffData : []);
      } catch (err) {
        if (isMounted) {
          toast.error(t("Failed to load tasks or staff"));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [t]);

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

  useEffect(() => {
    if (!selectedTask) return;
    const latest = tasks.find((t) => t.id === selectedTask.id);
    if (!latest) {
      setSelectedTask(null);
    } else if (latest !== selectedTask) {
      setSelectedTask(latest);
    }
  }, [tasks, selectedTask]);

  // Handle initial speech result
  const handleRecognition = useCallback(
    async (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
      listeningRef.current = false;

      if (!transcript) {
        promptAndListen(getSpeechText("start", currentLang), langVoiceCode);
        return;
      }

      if (lastTranscriptRef.current === transcript) {
        startListening();
        return;
      }

      lastTranscriptRef.current = transcript;
      let handedOff = false;
      setIsProcessingVoice(true);

      try {
        const res = await secureFetch("/voice-command", {
          method: "POST",
          headers: {
            "x-client-lang": currentLang,
          },
          body: JSON.stringify({
            message: transcript,
            created_by: 425425,
          }),
        });

        const { status, parsed } = res || {};

        if (status === "saved") {
          handedOff = true;
          speakText(getSpeechText("saved", currentLang), {
            lang: langVoiceCode,
            onComplete: () => setIsProcessingVoice(false),
          });
          lastTranscriptRef.current = "";
          return;
        }

        if (status === "missing_fields") {
          const dueISO = extractTimeFromText(transcript, currentLang);
          const staffGuess = staffList.find((s) =>
            transcript.toLowerCase().includes(s.name.toLowerCase())
          );
          const assignedName = staffGuess?.name;

          if (parsed?.title && dueISO && assignedName) {
            try {
              const created = await secureFetch("/tasks", {
                method: "POST",
                body: JSON.stringify({
                  title: parsed.title,
                  description: parsed.description || "",
                  assigned_to_name: assignedName,
                  due_at: dueISO,
                  created_by: 425425,
                  input_method: "voice",
                  voice_response: true,
                }),
              });
              setTasks((prev) => [created, ...prev]);
              handedOff = true;
              speakText(getSpeechText("saved", currentLang), {
                lang: langVoiceCode,
                onComplete: () => setIsProcessingVoice(false),
              });
              lastTranscriptRef.current = "";
            } catch (manualErr) {
              console.error("❌ Failed to save manually completed task", manualErr);
              toast.error(t("Failed to save manually completed task."));
              handedOff = true;
              promptAndListen(getSpeechText("error", currentLang), langVoiceCode);
            }
          } else {
            handedOff = true;
            promptAndListen(
              `${getSpeechText("missing_fields", currentLang)}. ${getSpeechText(
                "missing_fields_example",
                currentLang
              )}`,
              langVoiceCode
            );
            lastTranscriptRef.current = "";
          }
          return;
        }

        handedOff = true;
        promptAndListen(getSpeechText("error", currentLang), langVoiceCode);
      } catch (err) {
        console.error("❌ Voice-task error:", err);
        toast.error(t("Failed to process speech."));
        handedOff = true;
        promptAndListen(getSpeechText("error", currentLang), langVoiceCode);
      } finally {
        if (!handedOff) {
          setIsProcessingVoice(false);
        }
      }
    },
    [
      langVoiceCode,
      promptAndListen,
      speakText,
      staffList,
      startListening,
      setTasks,
      secureFetch,
    ]
  );

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.onresult = handleRecognition;
    recognition.onstart = () => {
      listeningRef.current = true;
    };
    recognition.onend = () => {
      listeningRef.current = false;
      setIsProcessingVoice(false);
    };
    recognition.onerror = (event) => {
      listeningRef.current = false;
      if (event?.error && event.error !== "aborted") {
        console.error("🎤 Mic error:", event.error);
        promptAndListen(getSpeechText("error", currentLang), langVoiceCode);
      } else {
        setIsProcessingVoice(false);
      }
    };

    return () => {
      recognition.onresult = null;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
    };
  }, [handleRecognition, langVoiceCode, promptAndListen, currentLang]);


  const startVoiceRecognition = useCallback(() => {
    if (!recognitionRef.current) {
      toast.warn("Speech recognition is not available on this device.");
      return;
    }

    lastTranscriptRef.current = "";
    setIsProcessingVoice(true);
    stopListening();
    cancelSpeech();
    promptAndListen(getSpeechText("start", currentLang), langVoiceCode);
  }, [
    cancelSpeech,
    currentLang,
    langVoiceCode,
    promptAndListen,
    stopListening,
  ]);




  // Manual submit
  const handleManualSubmit = async () => {
    if (!manualTitle || !manualAssignedTo || !manualDueAt) {
      return toast.warn(t("Please fill title, assignee, and due date"));
    }

    try {
      const isoDue = new Date(manualDueAt).toISOString();
      await secureFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: manualTitle,
          description: manualDescription,
          assigned_to_name: staffList.find((s) => s.id === Number(manualAssignedTo))?.name,
          due_at: isoDue,
          created_by: 425425,
          input_method: "manual",
        }),
      });

      // ✅ Let socket handle adding the task — no duplication
      toast.success(t("Task added"));
      setManualTitle("");
      setManualDescription("");
      setManualAssignedTo("");
      setManualDueAt("");
    } catch (e) {
      console.error("❌ Could not add task", e);
      toast.error(t("Could not add task"));
    }
  };


  const handleStartTask = async (id) => {
    try {
      const updated = await secureFetch(`/tasks/${id}/start`, { method: "PATCH" });
      toast.success(t("Task started!"));
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error("❌ Failed to start task", err);
      toast.error(t("Failed to start task"));
    }
  };
  const handleCompleteTask = async (id) => {
    try {
      const updated = await secureFetch(`/tasks/${id}/complete`, { method: "PATCH" });
      toast.success(t("Task completed!"));
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error("❌ Failed to complete task", err);
      toast.error(t("Failed to complete task"));
    }
  };
  const formatDuration = (s, e = new Date()) => {
    const ms = new Date(e) - new Date(s);
    return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
  };

  const clearTasks = async () => {
    try {
      const res = await secureFetch("/tasks/clear-completed", { method: "DELETE" });
      const count = res?.count || 0;

      setTasks((prev) =>
        Array.isArray(prev) ? prev.filter((task) => task && task.status !== "completed") : []
      );

      toast.success(
        count === 1
          ? `✅ ${t("Cleared 1 completed task")}`
          : `✅ ${t("Cleared {{count}} completed tasks", { count })}`
      );
    } catch (err) {
      console.error("❌ Failed to clear completed tasks", err);
      toast.error(t("Failed to clear completed tasks"));
    }
  };





  const handleSaveEdit = async (taskId) => {
  try {
    const payload = {
      title: editedTask.title?.trim(),
      description: editedTask.description?.trim() || "",
      assigned_to: editedTask.assigned_to ? Number(editedTask.assigned_to) : null,
      due_at: editedTask.due_at || null,
      priority: editedTask.priority || "medium",
      station: editedTask.station || null,
    };

    // Ensure title exists before sending
    if (!payload.title) {
      toast.warning(t("Task title is required."));
      return;
    }

    const updatedTask = await secureFetch(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    const updated = tasks.map((t) =>
      t.id === taskId ? updatedTask : t
    );
    setTasks(updated);
    setSelectedTask((prev) => (prev?.id === taskId ? updatedTask : prev));
    setEditingTaskId(null);
    setEditedTask({});
    toast.success(t("Task updated!"));
  } catch (err) {
    console.error("❌ Failed to update task", err);
    toast.error(t("Failed to save task"));
  }
};

  const now = new Date();
  const searchValue = searchTerm.trim().toLowerCase();

  const statusOptions = [
    { key: "all", label: t("All statuses") },
    { key: "todo", label: t("Planned") },
    { key: "progress", label: t("In Progress") },
    { key: "done", label: t("Completed") },
  ];

  const priorityOptions = [
    { key: "all", label: t("All priorities") },
    { key: "high", label: t("High") },
    { key: "medium", label: t("Medium") },
    { key: "low", label: t("Low") },
  ];

  const bucketForTask = (task) => {
    if (task.status === "completed") return "done";
    if (task.status === "in_progress") return "progress";
    return "todo";
  };

  const isOverdue = (task) =>
    task.status !== "completed" && task.due_at && new Date(task.due_at) < now;

  const filteredTasks = tasks.filter((task) => {
    const matchesStaff =
      activeStaffId === null ||
      (activeStaffId === "unassigned" && !task.assigned_to) ||
      task.assigned_to === activeStaffId;
    const haystack = `${task.title || ""} ${task.description || ""}`.toLowerCase();
    const matchesSearch = !searchValue || haystack.includes(searchValue);
    const matchesStatus = statusFilter === "all" || bucketForTask(task) === statusFilter;
    const taskPriority = (task.priority || "medium").toLowerCase();
    const matchesPriority =
      priorityFilter === "all" || taskPriority === priorityFilter;
    const matchesOverdue = !showOverdueOnly || isOverdue(task);
    return matchesStaff && matchesSearch && matchesStatus && matchesPriority && matchesOverdue;
  });

  const boardColumns = [
    {
      key: "todo",
      title: t("Planned"),
      badge: "bg-slate-100 text-slate-600",
      ring: "ring-slate-200/70",
    },
    {
      key: "progress",
      title: t("In Progress"),
      badge: "bg-blue-100 text-blue-700",
      ring: "ring-blue-200/60",
    },
    {
      key: "done",
      title: t("Completed"),
      badge: "bg-emerald-100 text-emerald-700",
      ring: "ring-emerald-200/60",
    },
  ];

  const groupedTasks = boardColumns.reduce(
    (acc, column) => ({ ...acc, [column.key]: [] }),
    {}
  );
  filteredTasks.forEach((task) => {
    const bucket = bucketForTask(task);
    if (!groupedTasks[bucket]) groupedTasks[bucket] = [];
    groupedTasks[bucket].push(task);
  });

  const totalCount = tasks.length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const overdueCount = tasks.filter(isOverdue).length;
  const completionRate = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const summaryCards = [
    {
      title: t("Total Tasks"),
      value: totalCount,
      meta: `${completedCount}/${totalCount || 1} ${t("completed")}`,
      badge: "bg-indigo-500/15 text-indigo-600",
      icon: "🗂️",
      progress: completionRate,
    },
    {
      title: t("In Progress"),
      value: inProgressCount,
      meta: t("Being worked on"),
      badge: "bg-blue-500/15 text-blue-600",
      icon: "⚙️",
    },
    {
      title: t("Completed"),
      value: completedCount,
      meta: t("Done this cycle"),
      badge: "bg-emerald-500/15 text-emerald-600",
      icon: "✅",
    },
    {
      title: t("Overdue"),
      value: overdueCount,
      meta: t("Require attention"),
      badge: "bg-rose-500/15 text-rose-600",
      icon: "⏰",
    },
  ];

  const staffInsights = staffList.map((staff) => {
    const assigned = tasks.filter((task) => task.assigned_to === staff.id);
    const active = assigned.filter((task) => task.status !== "completed");
    const completed = assigned.filter((task) => task.status === "completed").length;
    const nextDue = active
      .filter((task) => task.due_at)
      .map((task) => new Date(task.due_at))
      .sort((a, b) => a - b)[0];

    return {
      id: staff.id,
      name: staff.name,
      role: staff.role || "",
      active: active.length,
      completed,
      total: assigned.length,
      nextDue,
    };
  });

  const unassignedActive = tasks.filter(
    (task) => !task.assigned_to && task.status !== "completed"
  );
  const unassignedCompleted = tasks.filter(
    (task) => !task.assigned_to && task.status === "completed"
  );

  const staffPanelItems = [
    ...(unassignedActive.length || unassignedCompleted.length
      ? [
          {
            id: "unassigned",
            name: t("Unassigned"),
            role: t("Needs attention"),
            active: unassignedActive.length,
            completed: unassignedCompleted.length,
            total: unassignedActive.length + unassignedCompleted.length,
            nextDue: unassignedActive
              .filter((task) => task.due_at)
              .map((task) => new Date(task.due_at))
              .sort((a, b) => a - b)[0],
          },
        ]
      : []),
    ...staffInsights.sort((a, b) => b.active - a.active || b.total - a.total),
  ];

  const formatDueDate = (value) => {
    if (!value) return t("No due date");
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString(i18n.language || "en", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setEditingTaskId(null);
    setEditedTask({});
  };

  const voiceButtonLabel = isProcessingVoice ? t("Listening...") : t("Speak Task");
  const isTaskSelectedEditing = selectedTask && editingTaskId === selectedTask.id;
  const selectedStaffMember = selectedTask
    ? staffList.find((s) => s.id === selectedTask.assigned_to)
    : null;
  const selectedIsCompleted = selectedTask?.status === "completed";
  const selectedInProgress = selectedTask?.status === "in_progress";
  const showDetailPanel = Boolean(selectedTask);

  const beginEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditedTask({
      title: task.title || "",
      description: task.description || "",
      due_at: task.due_at ? task.due_at.slice(0, 16) : "",
      assigned_to: task.assigned_to ?? "",
      priority: task.priority || "medium",
      station: task.station || "",
    });
  };

  const panelBase = darkMode
    ? "bg-white/5 border border-white/10"
    : "bg-white border border-slate-200";
  const dividerClass = darkMode ? "border-white/10" : "border-slate-100";
  const priorityPills = darkMode
    ? {
        high: "bg-rose-500/20 text-rose-200",
        medium: "bg-amber-500/20 text-amber-200",
        low: "bg-emerald-500/20 text-emerald-200",
      }
    : {
        high: "bg-rose-100 text-rose-600",
        medium: "bg-amber-100 text-amber-600",
        low: "bg-emerald-100 text-emerald-700",
      };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? "bg-[#0b1220] text-slate-100" : "bg-[#f7f9fc] text-slate-900"
      }`}
      style={{
        fontSize: fontSize || "0.95rem",
        fontFamily: fontFamily || "Inter, sans-serif",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header className={`${panelBase} rounded-3xl p-6 shadow-lg transition-all`}>
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] opacity-60">
                {t("Task workspace")}
              </p>
              <h1 className="mt-2 text-3xl font-semibold">{t("Team Task Hub")}</h1>
              <p className="mt-2 text-sm opacity-70 max-w-xl">
                {t("Plan, track, and celebrate progress in a Monday-inspired light view.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={startVoiceRecognition}
                disabled={isProcessingVoice}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold shadow transition ${
                  isProcessingVoice
                    ? "opacity-70 cursor-not-allowed"
                    : "hover:-translate-y-0.5 hover:shadow-md"
                } ${darkMode ? "bg-indigo-500/90 text-white" : "bg-indigo-500 text-white"}`}
              >
                🎤 {voiceButtonLabel}
              </button>
              <button
                onClick={() => setShowManualModal(true)}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold shadow hover:-translate-y-0.5 hover:shadow-md transition ${
                  darkMode ? "bg-emerald-500/90 text-white" : "bg-emerald-500 text-white"
                }`}
              >
                ➕ {t("Add Task")}
              </button>
              <button
                onClick={clearTasks}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${
                  darkMode
                    ? "bg-white/5 text-rose-200 hover:bg-white/10"
                    : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                }`}
              >
                🧹 {t("Clear Completed")}
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className={`${panelBase} rounded-3xl p-8 text-center text-sm opacity-80`}>
            {t("Loading tasks...")}
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <div
                  key={card.title}
                  className={`${panelBase} rounded-3xl p-5 shadow-sm hover:shadow-md transition-transform hover:-translate-y-0.5`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{card.icon}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${card.badge}`}>
                      {card.meta}
                    </span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wide opacity-60 font-semibold">
                    {card.title}
                  </p>
                  <p className="text-3xl font-semibold mt-2">{card.value}</p>
                  {typeof card.progress === "number" && (
                    <div className="mt-4">
                      <div className={`${darkMode ? "bg-white/10" : "bg-slate-100"} h-2 rounded-full`}>
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500"
                          style={{ width: `${card.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs opacity-60">
                        {card.progress}% {t("completion")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className={`${panelBase} rounded-3xl p-5 shadow-sm`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative flex-1 min-w-[220px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("Search by title or description")}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                      darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                    }`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((option) => {
                    const active = statusFilter === option.key;
                    return (
                      <button
                        key={option.key}
                        onClick={() => setStatusFilter(option.key)}
                        className={`px-3 py-1.5 rounded-2xl text-sm font-medium transition ${
                          active
                            ? "bg-sky-500 text-white shadow"
                            : darkMode
                            ? "bg-white/5 text-slate-200 hover:bg-white/10"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map((option) => {
                    const active = priorityFilter === option.key;
                    return (
                      <button
                        key={option.key}
                        onClick={() => setPriorityFilter(option.key)}
                        className={`px-3 py-1.5 rounded-2xl text-sm font-medium transition ${
                          active
                            ? "bg-amber-500 text-white shadow"
                            : darkMode
                            ? "bg-white/5 text-slate-200 hover:bg-white/10"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOverdueOnly((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-2xl text-sm font-semibold transition ${
                      showOverdueOnly
                        ? "bg-rose-500 text-white shadow"
                        : darkMode
                        ? "bg-white/5 text-slate-200 hover:bg-white/10"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    ⏰ {t("Overdue")}
                  </button>
                  {(statusFilter !== "all" ||
                    priorityFilter !== "all" ||
                    showOverdueOnly ||
                    activeStaffId !== null) && (
                    <button
                      onClick={() => {
                        setStatusFilter("all");
                        setPriorityFilter("all");
                        setShowOverdueOnly(false);
                        setActiveStaffId(null);
                      }}
                      className={`px-3 py-1.5 rounded-2xl text-sm font-medium transition ${
                        darkMode
                          ? "bg-white/5 text-slate-200 hover:bg-white/10"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      ✨ {t("Clear filters")}
                    </button>
                  )}
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[260px_1fr_320px]">
              <aside className={`${panelBase} rounded-3xl p-5 shadow-sm space-y-5`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{t("Team focus")}</h3>
                  {activeStaffId !== null && (
                    <button
                      onClick={() => setActiveStaffId(null)}
                      className="text-xs font-semibold text-sky-500 hover:underline"
                    >
                      {t("Show all")}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveStaffId(null)}
                    className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                      activeStaffId === null
                        ? "border-sky-400 bg-sky-50 text-sky-700 shadow"
                        : darkMode
                        ? "border-white/5 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t("All teammates")}</span>
                      <span className="text-xs opacity-60">{tasks.length}</span>
                    </div>
                    <p className="text-xs opacity-70 mt-1">{t("Every task across the team")}</p>
                  </button>
                  {staffPanelItems.length === 0 && (
                    <p className="text-xs opacity-60">{t("No staff assigned yet.")}</p>
                  )}
                  {staffPanelItems.map((member) => {
                    const isActive = activeStaffId === member.id;
                    const nextDueLabel = member.nextDue
                      ? new Date(member.nextDue).toLocaleString(i18n.language || "en", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : t("No upcoming due");
                    return (
                      <button
                        key={member.id}
                        onClick={() =>
                          setActiveStaffId((prev) => (prev === member.id ? null : member.id))
                        }
                        className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                          isActive
                            ? "border-sky-400 bg-sky-50 text-sky-700 shadow"
                            : darkMode
                            ? "border-white/5 bg-white/5 hover:bg-white/10"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{member.name}</p>
                            {member.role && <p className="text-xs opacity-60">{member.role}</p>}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            {member.active}/{member.total}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                          <span>
                            {t("Completed")}: {member.completed}
                          </span>
                          <span>{nextDueLabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="space-y-5 overflow-x-auto pb-2">
                <div className="flex gap-5 min-w-[720px]">
                  {boardColumns.map((column) => {
                    const columnTasks = groupedTasks[column.key] || [];
                    return (
                      <div
                        key={column.key}
                        className={`${panelBase} ${column.ring || ""} ring-1 rounded-3xl p-4 w-full max-w-[340px] flex-shrink-0 shadow-sm`}
                      >
                        <div className={`flex items-center justify-between pb-3 border-b ${dividerClass}`}>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold tracking-wide uppercase">
                              {column.title}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${column.badge}`}>
                              {columnTasks.length}
                            </span>
                          </div>
                        </div>
                        <div className="pt-4 space-y-3">
                          {columnTasks.length === 0 ? (
                            <p className="text-xs opacity-60 rounded-2xl border border-dashed border-slate-300/70 p-4 text-center">
                              {t("No tasks here yet.")}
                            </p>
                          ) : (
                            columnTasks.map((task) => {
                              const assigned = staffList.find((s) => s.id === task.assigned_to);
                              const priorityKey = (task.priority || "medium").toLowerCase();
                              const priorityClass = priorityPills[priorityKey] || priorityPills.medium;
                              const overdue = isOverdue(task);
                              const isSelected = selectedTask?.id === task.id;
                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => handleSelectTask(task)}
                                  className={`w-full text-left rounded-2xl border p-4 transition-all ${
                                    isSelected
                                      ? "ring-2 ring-sky-400 border-transparent"
                                      : "hover:-translate-y-0.5"
                                  } ${
                                    darkMode
                                      ? "bg-slate-900/70 border-white/10 hover:bg-slate-900"
                                      : "bg-white border-slate-200 hover:border-sky-200 hover:bg-sky-50/40"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold leading-tight">{task.title}</p>
                                      {task.description && (
                                        <p className="mt-1 text-xs opacity-70 line-clamp-2">
                                          {task.description}
                                        </p>
                                      )}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${priorityClass}`}>
                                      {t(
                                        (task.priority || "medium")
                                          .charAt(0)
                                          .toUpperCase() + (task.priority || "medium").slice(1)
                                      )}
                                    </span>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide opacity-70">
                                    <span
                                      className={`px-2 py-0.5 rounded-full ${
                                        overdue
                                          ? darkMode
                                            ? "bg-rose-500/20 text-rose-200"
                                            : "bg-rose-100 text-rose-600"
                                          : darkMode
                                          ? "bg-emerald-500/15 text-emerald-200"
                                          : "bg-emerald-100 text-emerald-600"
                                      }`}
                                    >
                                      {overdue ? t("Overdue") : t("On track")}
                                    </span>
                                    <span className={darkMode ? "text-slate-300" : "text-slate-600"}>
                                      {formatDueDate(task.due_at)}
                                    </span>
                                    {assigned && (
                                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                        {assigned.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {task.status !== "completed" && task.status !== "in_progress" && (
                                      <button
                                        type="button"
                                        onClick={async (event) => {
                                          event.stopPropagation();
                                          handleSelectTask(task);
                                          await handleStartTask(task.id);
                                        }}
                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-400/90 text-slate-900 hover:bg-amber-400"
                                      >
                                        ✅ {t("Start")}
                                      </button>
                                    )}
                                    {task.status === "in_progress" && (
                                      <button
                                        type="button"
                                        onClick={async (event) => {
                                          event.stopPropagation();
                                          handleSelectTask(task);
                                          await handleCompleteTask(task.id);
                                        }}
                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/90 text-white hover:bg-emerald-500"
                                      >
                                        ✔️ {t("Complete")}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleSelectTask(task);
                                        beginEditTask(task);
                                      }}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                                        darkMode
                                          ? "bg-white/10 text-slate-100 hover:bg-white/20"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                      }`}
                                    >
                                      ✏️ {t("Edit")}
                                    </button>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <aside className={`${panelBase} rounded-3xl p-6 shadow-sm space-y-5`}>
                {showDetailPanel ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide opacity-60">
                          {t("Task ID")}: {selectedTask.id}
                        </p>
                        {isTaskSelectedEditing ? (
                          <input
                            value={editedTask.title}
                            onChange={(e) =>
                              setEditedTask((prev) => ({ ...prev, title: e.target.value }))
                            }
                            className={`mt-2 w-full rounded-2xl border px-3 py-2 font-semibold ${
                              darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                            }`}
                          />
                        ) : (
                          <h2 className="mt-2 text-xl font-semibold">{selectedTask.title}</h2>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedTask(null)}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                      >
                        ✖
                      </button>
                    </div>

                    {isTaskSelectedEditing ? (
                      <div className="space-y-4">
                        <textarea
                          value={editedTask.description}
                          onChange={(e) =>
                            setEditedTask((prev) => ({ ...prev, description: e.target.value }))
                          }
                          placeholder={t("Description")}
                          className={`w-full min-h-[100px] rounded-2xl border px-3 py-2 ${
                            darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                          }`}
                        />
                        <div className="grid grid-cols-1 gap-3">
                          <label className="space-y-1 text-xs uppercase tracking-wide opacity-70">
                            <span>{t("Due date")}</span>
                            <input
                              type="datetime-local"
                              value={editedTask.due_at}
                              onChange={(e) =>
                                setEditedTask((prev) => ({ ...prev, due_at: e.target.value }))
                              }
                              className={`w-full rounded-2xl border px-3 py-2 ${
                                darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                              }`}
                            />
                          </label>
                          <label className="space-y-1 text-xs uppercase tracking-wide opacity-70">
                            <span>{t("Assignee")}</span>
                            <select
                              value={editedTask.assigned_to ?? ""}
                              onChange={(e) =>
                                setEditedTask((prev) => ({
                                  ...prev,
                                  assigned_to: e.target.value ? Number(e.target.value) : "",
                                }))
                              }
                              className={`w-full rounded-2xl border px-3 py-2 ${
                                darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                              }`}
                            >
                              <option value="">{t("Unassigned")}</option>
                              {staffList.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1 text-xs uppercase tracking-wide opacity-70">
                            <span>{t("Priority")}</span>
                            <select
                              value={editedTask.priority || "medium"}
                              onChange={(e) =>
                                setEditedTask((prev) => ({ ...prev, priority: e.target.value }))
                              }
                              className={`w-full rounded-2xl border px-3 py-2 ${
                                darkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
                              }`}
                            >
                              <option value="high">{t("High")}</option>
                              <option value="medium">{t("Medium")}</option>
                              <option value="low">{t("Low")}</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleSaveEdit(selectedTask.id)}
                            className="px-4 py-2 rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-400"
                          >
                            💾 {t("Save")}
                          </button>
                          <button
                            onClick={() => setEditingTaskId(null)}
                            className={`px-4 py-2 rounded-2xl font-semibold ${
                              darkMode
                                ? "bg-white/10 text-slate-100 hover:bg-white/20"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            ❌ {t("Cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedTask.description && (
                          <p className="text-sm leading-relaxed opacity-80">
                            {selectedTask.description}
                          </p>
                        )}
                        <div
                          className={`rounded-2xl border px-4 py-3 ${
                            darkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <p className="text-xs uppercase tracking-wide opacity-60">{t("Due")}</p>
                          <p className="text-sm font-medium">{formatDueDate(selectedTask.due_at)}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">{t("Status")}</span>
                            <span className="font-semibold uppercase">
                              {selectedTask.status === "in_progress"
                                ? t("In Progress")
                                : selectedTask.status === "completed"
                                  ? t("Completed")
                                  : t("Planned")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">{t("Priority")}</span>
                            <span className="font-semibold">
                              {t(
                                (selectedTask.priority || "medium")
                                  .charAt(0)
                                  .toUpperCase() + (selectedTask.priority || "medium").slice(1)
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">{t("Assignee")}</span>
                            <span className="font-semibold">
                              {selectedStaffMember ? selectedStaffMember.name : t("Unassigned")}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!selectedIsCompleted && !selectedInProgress && (
                            <button
                              onClick={() => handleStartTask(selectedTask.id)}
                              className="px-4 py-2 rounded-2xl bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
                            >
                              ✅ {t("Mark as in progress")}
                            </button>
                          )}
                          {selectedInProgress && (
                            <button
                              onClick={() => handleCompleteTask(selectedTask.id)}
                              className="px-4 py-2 rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-400"
                            >
                              ✔️ {t("Mark complete")}
                            </button>
                          )}
                          {!isTaskSelectedEditing && (
                            <button
                              onClick={() => beginEditTask(selectedTask)}
                              className={`px-4 py-2 rounded-2xl font-semibold ${
                                darkMode
                                  ? "bg-white/10 text-slate-100 hover:bg-white/20"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              ✏️ {t("Edit")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center space-y-3">
                    <span className="text-4xl">🗂️</span>
                    <p className="text-sm opacity-70">
                      {t("Select a task from the board to see the full context.")}
                    </p>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div
            className={`w-full max-w-xl p-6 rounded-3xl shadow-2xl relative border ${
              darkMode ? "bg-[#121b2f] border-white/20 text-white" : "bg-white border-slate-100"
            }`}
          >
            <button
              onClick={() => setShowManualModal(false)}
              className="absolute top-4 right-4 text-xl font-bold hover:text-rose-500"
            >
              ✖
            </button>
            <h2 className="text-2xl font-semibold mb-4 text-center">{t("Add Task Manually")}</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder={t("Task Title")}
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className={`w-full p-2.5 rounded-2xl border ${
                  darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                }`}
              />
              <textarea
                placeholder={t("Description (optional)")}
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                className={`w-full h-20 p-2.5 rounded-2xl border ${
                  darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                }`}
              />
              <div className="flex gap-3 flex-col md:flex-row">
                <select
                  value={manualAssignedTo}
                  onChange={(e) => setManualAssignedTo(e.target.value)}
                  className={`flex-1 p-2.5 rounded-2xl border ${
                    darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                  }`}
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
                  className={`flex-1 p-2.5 rounded-2xl border ${
                    darkMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                  }`}
                />
              </div>
              <button
                onClick={() => {
                  handleManualSubmit();
                  setShowManualModal(false);
                }}
                className={`w-full py-2.5 mt-2 rounded-2xl font-semibold shadow hover:-translate-y-0.5 transition ${
                  darkMode ? "bg-emerald-500/90 text-white" : "bg-emerald-500 text-white"
                }`}
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
