import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Toaster, toast } from 'react-hot-toast';
import Modal from 'react-modal';
import { X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import TextField from '@mui/material/TextField';
import { addDays, subDays, format, differenceInCalendarDays } from 'date-fns';
import 'react-clock/dist/Clock.css';
import { DesktopTimePicker } from '@mui/x-date-pickers/DesktopTimePicker';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

const API_URL = import.meta.env.VITE_API_URL || "";


Modal.setAppElement('#root');

const StaffSchedule = () => {
  // Core States
  const [staffList, setStaffList] = useState([]);
  const [view, setView] = useState('week');
  const [filter, setFilter] = useState('All');
  const [copiedShift, setCopiedShift] = useState(null);
 const { t } = useTranslation();

  // --- SHIFT MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState([]);
  const [staffSchedules, setStaffSchedules] = useState([]);
  const [copiedWeekShifts, setCopiedWeekShifts] = useState([]);
  const [isWeekCopied, setIsWeekCopied] = useState(false);
  const [allSchedules, setAllSchedules] = useState([]);
const [isAllSchedulesOpen, setIsAllSchedulesOpen] = useState(false);

const fetchAllSchedules = async (staffId) => {
  try {
    const res = await secureFetch(`/staff/${staffId}/schedule`);
    setAllSchedules(res.data);
    setIsAllSchedulesOpen(true);
  } catch (err) {
    toast.error("Failed to load schedules");
  }
};


  // --- PROFILE MODAL STATES ---
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedStaffProfile, setSelectedStaffProfile] = useState(null);
  const [roles, setRoles] = useState([]);

  // --- DATE RANGE STATES ---
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [isWeekView] = useState(false);
  // helpers – put this with the others, e.g. right after formatDays()
    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth()    === d2.getMonth() &&
      d1.getDate()     === d2.getDate();
  const weekdayIndex = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };


  useEffect(() => {
    if (staffList.length === 0) {
      fetchStaff();
    }
    if (staffSchedules.length === 0) {
      fetchStaffSchedules();
    }
  }, []);

  useEffect(() => {
  if (view === 'week') {
    const now = new Date();
    // Always set the start of the week to Monday
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1 - day); // Ensure Monday as the start
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setStartDate(monday);
    setEndDate(sunday);
  } else if (view === 'day') {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  }
}, [view]);


  useEffect(() => {
  if (view === 'week') {
    const now = new Date();
    const day = now.getDay();
    // Calculate the difference to find the most recent Monday
    const diff = day === 0 ? -6 : 1 - day; // Adjust to get Monday even if today is Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff); // Get the most recent Monday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Get the following Sunday
    setStartDate(monday);
    setEndDate(sunday);
  } else if (view === 'day') {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  }
}, [view]);


// Ensures days are always treated as an array
const formatDays = (days) => {
  if (Array.isArray(days)) return days;
  if (typeof days === 'string') return days.split(',').map((d) => d.trim());
  return [];
};

const handleClearWeek = async () => {
  const confirmClear = window.confirm("Are you sure you want to clear this week's schedule?");
  if (!confirmClear) return;

  try {
    // Using date-fns to format the week boundaries as local date strings
    const weekStartStr = format(startDate, 'yyyy-MM-dd');
    const weekEndStr = format(endDate, 'yyyy-MM-dd');

    // Filter schedules whose shift_date falls within the current week.
    // Adjust this logic if you need to also consider legacy cases without shift_date.
    const schedulesToClear = staffSchedules.filter(schedule => {
      if (schedule.shift_date) {
        const scheduleDateStr = format(new Date(schedule.shift_date), 'yyyy-MM-dd');
        return scheduleDateStr >= weekStartStr && scheduleDateStr <= weekEndStr;
      }
      return false;
    });
// Loop through each schedule and send a delete request
for (const schedule of schedulesToClear) {
  await secureFetch(`/staff/schedule/${schedule.id}`, {
    method: "DELETE",
  });
}

// Refresh the schedule list
await fetchStaffSchedules();

    toast.success("Weekly schedule cleared successfully!");
  } catch (error) {
    console.error("Error clearing weekly schedule:", error.message);
    toast.error("Failed to clear weekly schedule");
  }
};


  // Fetch staff list
  const fetchStaff = async () => {
  try {
const response = await secureFetch("/staff");
const staffData = response.map((staff) => ({
  ...staff,
  email: staff.email || '',
}));

    setStaffList(staffData);

    // Extract unique roles from the staffData
    const uniqueRoles = [...new Set(staffData.map(staff => staff.role))];
    setRoles(uniqueRoles);
  } catch (err) {
    console.error('Error fetching staff:', err);
    toast.error('Error fetching staff');
  }
};


  // Fetch staff schedules
  const fetchStaffSchedules = async () => {
  try {
const response = await secureFetch("/staff/schedule");
setStaffSchedules(
  response.map((schedule) => ({
    ...schedule,
    days: Array.isArray(schedule.days)
      ? schedule.days
      : (schedule.days || '').split(',').map((d) => d.trim()),
  }))
);

  } catch (err) {
    console.error('Error fetching staff schedules:', err);
    toast.error('Error fetching staff schedules');
  }
};



  // Convert time string to Date object and vice versa
  const timeStringToDate = (timeString) => {
    if (timeString instanceof Date) return timeString;
    if (!timeString || typeof timeString !== 'string') return null;
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    date.setSeconds(seconds || 0);
    return date;
  };

  const dateToTimeString = (date) => {
    if (!(date instanceof Date) || isNaN(date)) return '';
    return format(date, 'HH:mm:ss');
  };

  // Helper: Get an array of Date objects between start and end (inclusive)
  const getDatesInRange = (start, end) => {
  const dates = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};


  // Array of dates based on selected date range
  // Generate an array of dates between startDate and endDate (inclusive)
const displayDates = getDatesInRange(startDate, endDate);



  // SHIFT MODAL LOGIC
  const handleCardClick = (staff, day) => {
  // Get the day abbreviation and full date
  const clickedDayAbbrev = day.toLocaleDateString('en-US', { weekday: 'short' });
  const clickedFullDate = day.toISOString().split('T')[0];
  console.log('📊 Staff Schedules:', staffSchedules);

  // Find an existing schedule that includes the clicked day.
  const schedule = staffSchedules.find((sched) =>
    sched.staff_id === staff.id &&
    formatDays(sched.days).includes(clickedDayAbbrev)
  );

  if (schedule) {
  setSelectedShift({
    ...schedule,
    staff,
    day: clickedDayAbbrev, // the clicked day abbreviation (e.g. "Tue")
    shift_date: clickedFullDate, // the full date for the clicked cell (e.g. "2025-04-08")
    originalDays: schedule.days, // preserve the full array (e.g. ["Mon", "Tue"])
    originalShiftDate: schedule.shift_date, // preserve the original shift_date of the record
  });
  setSelectedDays([clickedDayAbbrev]);
  // ...
}
else {
  console.log('❗ No existing schedule found for the selected staff and day.');
  // New record: include the clicked day so that later saving has a valid day value.
  setSelectedShift({ staff, day: clickedDayAbbrev, shift_date: clickedFullDate });
  setSelectedDays([clickedDayAbbrev]);
}
  setIsModalOpen(true);
};




  const handleTimeChange = (value, setTime) => {
    if (value instanceof Date && !isNaN(value)) {
      const formattedTime = dateToTimeString(value);
      setTime(formattedTime);
      console.log("Formatted Time: ", formattedTime);
    }
  };

  useEffect(() => {
  if (selectedShift) {
    // Only force single-day selection in edit mode.
    if (selectedShift.id) {
      let clickedDay;
      if (
        typeof selectedShift.day === 'string' &&
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(selectedShift.day)
      ) {
        clickedDay = selectedShift.day;
      } else {
        clickedDay = new Date(selectedShift.shift_date).toLocaleDateString('en-US', {
          weekday: 'short',
        });
      }
      setSelectedDays([clickedDay]);

      const schedule = staffSchedules.find((sched) =>
        sched.staff_id === selectedShift.staff.id &&
        formatDays(sched.days).includes(clickedDay)
      );
      if (schedule) {
        setStartTime(timeStringToDate(schedule.shift_start));
        setEndTime(timeStringToDate(schedule.shift_end));
      }
    }
    // If creating a new shift (selectedShift has no id), do not override selectedDays.
  }
}, [selectedShift, staffSchedules]);




// ---------- FULL UPDATED handleSaveShift (one DB row per selected day) ----------
const handleSaveShift = async () => {
  try {
    if (!selectedShift) {
      toast.error('No shift selected');
      return;
    }

    /* ---------- common values ---------- */
    const staffId       = selectedShift.staff.id;
    const role          = selectedShift.staff.role || 'Unknown';
    const salary        = selectedShift.staff.salary || 0;
    const newShiftStart = dateToTimeString(timeStringToDate(startTime));
    const newShiftEnd   = dateToTimeString(timeStringToDate(endTime));

    /* ---------- days & base date ---------- */
    const pickedDays    = selectedDays.length ? selectedDays : [selectedShift.day];
    const baseDateObj   = new Date(selectedShift.shift_date);
    if (isNaN(baseDateObj)) {
      toast.error('Invalid shift date');
      return;
    }

    /* ---------- helper for weekday → offset ---------- */
    const weekdayIdx = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

    /* ---------- prepare payload factory ---------- */
    const makePayload = (dayAbbrev, dateObj) => ({
      staff_id:    staffId,
      role,
      shift_start: newShiftStart,
      shift_end:   newShiftEnd,
      shift_date:  dateObj.toISOString().split('T')[0],
      salary,
      days:        [dayAbbrev],
    });

    /* ---------- EDIT EXISTING RECORD ---------- */
    if (selectedShift.id) {
      const originalDays = selectedShift.originalDays
        ? formatDays(selectedShift.originalDays)
        : formatDays(selectedShift.days);

      if (originalDays.length > 1) {
        const remainingDays = originalDays.filter(
          d => !pickedDays.map(p => p.toLowerCase()).includes(d.toLowerCase())
        );

        await secureFetch(`/staff/schedule/${selectedShift.id}`, {
          method: "PUT",
          body: JSON.stringify({
            shift_start: selectedShift.shift_start,
            shift_end:   selectedShift.shift_end,
            status:      selectedShift.status || 'Scheduled',
            salary,
            days:        remainingDays,
          }),
        });

        setStaffSchedules(prev =>
          remainingDays.length
            ? prev.map(s =>
                s.id === selectedShift.id ? { ...s, days: remainingDays } : s
              )
            : prev.filter(s => s.id !== selectedShift.id)
        );
      }

      for (const day of pickedDays) {
        const offset =
          (weekdayIdx[day] - baseDateObj.getDay() + 7) % 7;
        const exactDate = new Date(baseDateObj);
        exactDate.setDate(baseDateObj.getDate() + offset);

        const payload = makePayload(day, exactDate);

        const res = await secureFetch("/staff/schedule", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStaffSchedules(prev => [...prev, res.schedule]);
      }

      toast.success(`Shift updated for ${selectedShift.staff.name}`);

    /* ---------- BRAND-NEW SHIFT ---------- */
    } else {
      for (const day of pickedDays) {
        const offset =
          (weekdayIdx[day] - baseDateObj.getDay() + 7) % 7;
        const exactDate = new Date(baseDateObj);
        exactDate.setDate(baseDateObj.getDate() + offset);

        const payload = makePayload(day, exactDate);

        const res = await secureFetch("/staff/schedule", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStaffSchedules(prev => [...prev, res.schedule]);
      }

      toast.success(`Shift created for ${selectedShift.staff.name}`);
    }

    /* ---------- refresh + close ---------- */
    await fetchStaffSchedules();
    setSelectedShift(null);
    setIsModalOpen(false);
  } catch (err) {
    console.error('Error saving shift:', err.message);
    toast.error('Failed to save shift');
  }
};





  const toggleDaySelection = (day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleDeleteShiftDay = async (shiftId, dayToDelete) => {
  try {
    let schedule = staffSchedules.find((sched) => sched.id === shiftId);

    if (!schedule) {
      const staffId = selectedShift?.staff?.id;
      schedule = staffSchedules.find(
        (sched) =>
          sched.staff_id === staffId &&
          formatDays(sched.days).includes(dayToDelete)
      );
    }

    if (!schedule) {
      console.error('❌ Schedule not found for the given shift ID');
      toast.error('Shift not found');
      return;
    }

    // Ensure days are always treated as an array
    const daysArr = formatDays(schedule.days);

    if (daysArr.length > 1) {
      // Remove the specified day
      const updatedDays = daysArr.filter((d) => d !== dayToDelete);

      // Prepare the updated schedule payload
      const payload = { ...schedule, days: updatedDays };

      // Update the schedule via API
      const response = await axios.put(
        `${BASE_URL}/api/staff/schedule/${schedule.id}`,
        payload
      );

      // Update state with the modified schedule
      setStaffSchedules((prev) =>
        prev.map((sched) =>
          sched.id === schedule.id ? response.data.schedule : sched
        )
      );
      toast.success('Shift day updated successfully');
    } else {
      // Delete the entire shift if only one day exists
   await secureFetch(`/staff/schedule/${schedule.id}`, {
  method: "DELETE",
});

setStaffSchedules((prev) =>
  prev.filter((sched) => sched.id !== schedule.id)
);

      toast.success('Shift deleted successfully');
    }

    setIsModalOpen(false);
  } catch (err) {
    console.error('❌ Error deleting shift day:', err.message);
    toast.error('Failed to delete shift day');
  }
};





  const handleDeleteShiftDayForCell = async (shiftId, dayToDelete) => {
  try {
    const schedule = staffSchedules.find((sched) => sched.id === shiftId);
    if (!schedule) return;

    // Format days using the helper function
    const daysArr = formatDays(schedule.days);

    if (daysArr.length > 1) {
      const updatedDays = daysArr.filter((day) => day !== dayToDelete);
      const payload = { ...schedule, days: updatedDays };

      const response = await axios.put(
        `${BASE_URL}/api/staff/schedule/${shiftId}`,
        payload
      );

      setStaffSchedules((prev) =>
        prev.map((sched) =>
          sched.id === shiftId ? response.data.schedule : sched
        )
      );
      toast.success('Shift day removed successfully');
    } else {
await secureFetch(`/staff/schedule/${shiftId}`, {
  method: "DELETE",
});

setStaffSchedules((prev) =>
  prev.filter((sched) => sched.id !== shiftId)
);

      toast.success('Shift deleted successfully');
    }
  } catch (err) {
    console.error('Error deleting shift day:', err.message);
    toast.error('Failed to delete shift day');
  }
};



  // PROFILE MODAL LOGIC
 const handleEditStaffProfile = (staff) => {
  const isHourly = staff.salary_model === 'hourly';

  const staffWithId = {
    ...staff,
    id: staff.id || staff._id,
    email: staff.email || '',
    salary_model: staff.salary_model || 'fixed',
    payment_type: staff.payment_type || 'daily',

    // Handle based on model
    salary: isHourly ? '' : staff.salary || '',
    hourly_rate: isHourly ? staff.hourly_rate || '' : '',

    // Optional fields for future use
    weekly_salary: staff.weekly_salary || '',
    monthly_salary: staff.monthly_salary || '',
  };

  setSelectedStaffProfile(staffWithId);
  setIsProfileModalOpen(true);
};


  const handleSaveProfile = async () => {
  try {
    const isHourly = selectedStaffProfile.salary_model === 'hourly';
const isWeekly = selectedStaffProfile.payment_type === 'weekly';
const isMonthly = selectedStaffProfile.payment_type === 'monthly';

const baseSalary = Number(selectedStaffProfile.salary) || 0;

const payload = {
  name: selectedStaffProfile.name,
  role: selectedStaffProfile.role,
  phone: selectedStaffProfile.phone,
  address: selectedStaffProfile.address,
  salary: Number(selectedStaffProfile.salary),
  payment_type: selectedStaffProfile.payment_type,
  email: selectedStaffProfile.email || '',
  salary_model: selectedStaffProfile.salary_model || 'fixed',
  hourly_rate:
    selectedStaffProfile.salary_model === 'hourly'
      ? Number(selectedStaffProfile.hourly_rate) || 0
      : null,
  weekly_salary:
    selectedStaffProfile.salary_model === 'fixed' &&
    selectedStaffProfile.payment_type === 'weekly'
      ? Number(selectedStaffProfile.salary) || 0
      : null,
  monthly_salary:
    selectedStaffProfile.salary_model === 'fixed' &&
    selectedStaffProfile.payment_type === 'monthly'
      ? Number(selectedStaffProfile.salary) || 0
      : null,
};



   const response = await secureFetch(`/staff/${selectedStaffProfile.id}`, {
  method: "PUT",
  body: JSON.stringify(payload),
});

const updatedStaff = response.staff;


    setStaffList((prevStaff) =>
      prevStaff.map((staff) =>
        staff.id === updatedStaff.id ? updatedStaff : staff
      )
    );

    toast.success(`Profile updated for ${updatedStaff.name}`);
    setIsProfileModalOpen(false);
  } catch (err) {
    console.error('Error updating profile:', err);
    toast.error('Failed to update profile');
  }
};






  // Calculate total hours based on selected date range
  const calculateTotalWeeklyHours = (staffId) => {
  let totalMinutes = 0;
  const uniqueShifts = new Set();

  // Use date-fns format to get local date strings
  const weekStartStr = format(startDate, 'yyyy-MM-dd');
  const weekEndStr = format(endDate, 'yyyy-MM-dd');

  // Loop through schedules for the specified staff
  staffSchedules.forEach(schedule => {
    if (schedule.staff_id === staffId) {
      // Convert the schedule shift_date to a local formatted date string
      const scheduleDateStr = format(new Date(schedule.shift_date), 'yyyy-MM-dd');

      // Check if the schedule's date is within the week boundaries
      if (scheduleDateStr >= weekStartStr && scheduleDateStr <= weekEndStr) {
        // Build a unique key per shift (if two shifts have identical times on the same day,
        // consider including an additional unique ID)
        const shiftKey = `${scheduleDateStr}-${schedule.shift_start}-${schedule.shift_end}`;

        if (!uniqueShifts.has(shiftKey)) {
          uniqueShifts.add(shiftKey);

          const [startHour, startMin] = schedule.shift_start.split(':').map(Number);
          const [endHour, endMin] = schedule.shift_end.split(':').map(Number);
          let durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);

          // Handle shifts that span past midnight
          if (durationMinutes < 0) durationMinutes += 24 * 60;

          totalMinutes += durationMinutes;
        }
      }
    }
  });

  return (totalMinutes / 60).toFixed(1);
};




  const calculateShiftDuration = (shiftStart, shiftEnd) => {
    const [startHour, startMin] = shiftStart.split(':').map(Number);
    const [endHour, endMin] = shiftEnd.split(':').map(Number);
    let durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    if (durationMinutes < 0) durationMinutes += 24 * 60;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  };

  const handleCopyShift = (shift) => {
  if (!shift) {
    toast.error('No shift selected to copy');
    return;
  }

  // Correctly extract staff details, even if the shift data structure varies
  const staffName = shift.staff?.name || shift.staff_name || 'Unknown Staff';
  const copied = {
    ...shift,
    staff_id: shift.staff?.id || shift.staff_id,
    staff_name: staffName,
    role: shift.staff?.role || shift.role,
    shift_start: shift.shift_start,
    shift_end: shift.shift_end,
    shift_date: shift.shift_date,
    days: Array.isArray(shift.days) ? shift.days : formatDays(shift.days),
    salary: shift.staff?.salary || shift.salary || 0,
  };

  if (copied.staff_id && copied.shift_start && copied.shift_end) {
    setCopiedShift(copied);
    console.log("✅ Shift copied successfully:", copied);
    toast.success(`Shift copied for ${staffName}`);
  } else {
    console.log("❌ Shift copy failed: Invalid shift data", shift);
    toast.error('Failed to copy shift');
  }
};


const handleCopyOrPasteWeek = async () => {
  try {
    if (!isWeekCopied) {
      // Copy the current week's shifts correctly, including Monday
      const weekShifts = staffSchedules.filter((shift) => {
        const shiftDate = new Date(shift.shift_date);
        const shiftDay = shiftDate.getDay();
        const isWithinWeek = shiftDate >= startDate && shiftDate <= endDate;

        // Explicitly include Monday as day 1 in the week range
        return (shiftDay === 1 || isWithinWeek);
      });

      if (weekShifts.length === 0) {
        toast.error('No shifts to copy this week');
        return;
      }

      setCopiedWeekShifts(weekShifts);
      setIsWeekCopied(true);
      toast.success('Week copied successfully');
    } else {
      // Paste the copied shifts to the next week
      if (copiedWeekShifts.length === 0) {
        toast.error('No week copied');
        return;
      }

      if (window.confirm('Are you sure you want to paste the copied shifts to the next week?')) {
        const nextWeekStartDate = addDays(startDate, 7);
        const nextWeekEndDate = addDays(endDate, 7);
        const nextWeekDates = getDatesInRange(nextWeekStartDate, nextWeekEndDate);

for (const copiedShift of copiedWeekShifts) {
  for (const date of nextWeekDates) {
    const shiftDate = date.toISOString().split("T")[0];
    const dayAbbrev = date.toLocaleDateString("en-US", { weekday: "short" });

    if (formatDays(copiedShift.days).includes(dayAbbrev)) {
      const payload = {
        staff_id: copiedShift.staff_id,
        role: copiedShift.role,
        shift_start: copiedShift.shift_start,
        shift_end: copiedShift.shift_end,
        shift_date: shiftDate,
        days: [dayAbbrev],
        salary: copiedShift.salary || 0,
      };

      await secureFetch("/staff/schedule", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
  }
}


        toast.success('Week pasted successfully');
        await fetchStaffSchedules();
        setStartDate((prev) => addDays(prev, 7));
        setEndDate((prev) => addDays(prev, 7));
        setIsWeekCopied(false);
        setCopiedWeekShifts([]);
      }
    }
  } catch (err) {
    console.error('Error during copy/paste week:', err.message);
    toast.error('Operation failed');
  }
};



  const handlePasteShift = async (staff, day) => {
  if (!copiedShift) return;
  // Compute a valid ISO date string from the clicked cell's day.
  const shiftDate = day.toISOString().split('T')[0];
  const payload = {
    staff_id: staff.id,
    role: staff.role,
    shift_start: copiedShift.shift_start,
    shift_end: copiedShift.shift_end,
    shift_date: shiftDate, // add this line
    days: day.toLocaleDateString('en-US', { weekday: 'short' }),
    salary: staff.salary,
  };
 try {
  const response = await secureFetch("/staff/schedule", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  setStaffSchedules((prev) => [...prev, response.schedule]);
  toast.success(`Shift pasted for ${staff.name}`);
  setCopiedShift(null);
}
 catch (err) {
    console.error('Error pasting shift:', err.message);
    toast.error('Failed to paste shift');
  }
};



  const handleDragEnd = async (result) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const [destStaffIdStr, destDayIndexStr] = destination.droppableId.split('-');
    const destStaffId = parseInt(destStaffIdStr, 10);
    const destDayIndex = parseInt(destDayIndexStr, 10);
    const destDay = displayDates[destDayIndex].toLocaleDateString('en-US', { weekday: 'short' });
    const scheduleToUpdate = staffSchedules.find(
      (sched) => `shift-${sched.id}` === draggableId
    );
    if (!scheduleToUpdate) return;
    const payload = {
      ...scheduleToUpdate,
      staff_id: destStaffId,
      days: destDay,
    };
    try {
      const response = await axios.put(
        `${BASE_URL}/api/staff/schedule/${scheduleToUpdate.id}`,
        payload
      );
      setStaffSchedules((prev) =>
        prev.map((sched) =>
          sched.id === scheduleToUpdate.id ? response.data.schedule : sched
        )
      );
      toast.success('Shift moved successfully');
    } catch (err) {
      console.error('Error moving shift:', err.message);
      toast.error('Failed to move shift');
    }
  };

  const groupStaffByRole = (staffList) => {
    return staffList.reduce((groups, staff) => {
      if (!groups[staff.role]) groups[staff.role] = [];
      groups[staff.role].push(staff);
      return groups;
    }, {});
  };

const handleDeleteShiftById = async (shiftId) => {
  try {
    await secureFetch(`/staff/schedule/${shiftId}`, {
      method: "DELETE",
    });

    setStaffSchedules((prev) =>
      prev.filter((sched) => sched.id !== shiftId)
    );
    toast.success("Shift deleted");
  } catch (err) {
    console.error("Error deleting shift:", err.message);
    toast.error("Failed to delete shift");
  }
};


  // Move Date Range by One Week (Monday to Sunday)
const handleDateChange = (direction) => {
  const currentStart = startDate;
  const currentEnd = endDate;
  if (direction === 'prev') {
    setStartDate(subDays(currentStart, 7));
    setEndDate(subDays(currentEnd, 7));
  } else if (direction === 'next') {
    setStartDate(addDays(currentStart, 7));
    setEndDate(addDays(currentEnd, 7));
  }
};



  const handleCustomDateChange = (newStart, newEnd) => {
    const difference = differenceInCalendarDays(newEnd, newStart);
    if (difference > 6) {
      toast.error('Date range cannot exceed 7 days. Auto-correcting.');
      setEndDate(addDays(newStart, 6));
    } else {
      setStartDate(newStart);
      setEndDate(newEnd);
    }
  };

  return (
<div className="p-0 w-full h-full min-h-screen space-y-5 text-gray-800 dark:text-gray-100 transition-colors mt-12">
      <Toaster position="top-center" reverseOrder={false} />


      {/* Date Range Pickers */}

<LocalizationProvider dateAdapter={AdapterDateFns}>
  <div className="flex gap-4 justify-center items-center relative z-0">
    {/* Previous Week Button */}
    <button
      onClick={() => handleDateChange('prev')}
      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-0.5"
    >
      {t('Previous Week')}
    </button>

    {/* Start Date */}
<DesktopDatePicker
  label={t('Start Date')}
  value={startDate}
  onChange={(newValue) => handleCustomDateChange(newValue, endDate)}
  slotProps={{ textField: { fullWidth: true } }}
/>



    {/* End Date */}
<DesktopDatePicker
  label={t('End Date')}
  value={endDate}
  onChange={(newValue) => handleCustomDateChange(startDate, newValue)}
  slotProps={{ textField: { fullWidth: true } }}
  disabled={isWeekView}
/>


    {/* Next Week Button */}
    <button
      onClick={() => handleDateChange('next')}
      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:-translate-y-0.5"
    >
      {t('Next Week')}
    </button>
  </div>
</LocalizationProvider>



      {/* VIEW + FILTER CONTROLS */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex space-x-4">
  {['day', 'week'].map((period) => (
    <button
      key={period}
      onClick={() => {
        setView(period);
        if (period === 'week') {
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - (day === 0 ? 6 : day - 1);
          const monday = new Date(now);
          monday.setDate(diff);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          setStartDate(monday);
          setEndDate(sunday);
        } else if (period === 'day') {
          const today = new Date();
          setStartDate(today);
          setEndDate(today);
        }
      }}
      className={`px-4 py-1 rounded-full transition-all duration-300 ${
        view === period
          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
          : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
      }`}
    >
       {t(period.charAt(0).toUpperCase() + period.slice(1))}
    </button>
  ))}
  {/* Paste to Next Week Button */}
<button
  onClick={handleCopyOrPasteWeek}
  className="px-4 py-1 rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl"
>
  {isWeekCopied ? t('Paste Week') : t('Copy Week')}
</button>
{/* NEW: Clear Week Button */}
  <button
    onClick={handleClearWeek}
    className="px-4 py-1 rounded-full transition-all duration-300 bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg hover:shadow-xl"
  >
     {t('Clear Week')}
  </button>
</div>


        <select
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  className="px-3 py-1 rounded-full bg-white shadow border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
>
  <option value="All">{t('All Roles')}</option> {/* Translated text */}
  {roles.map((role) => (
    <option key={role} value={role}>
      {role}
    </option>
  ))}
</select>

      </div>

      {/* SCHEDULE GRID */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <div
            className="bg-white/80 backdrop-blur-lg p-4 rounded-xl shadow-xl border border-gray-200 w-full"
            style={{
              gridTemplateColumns: `repeat(${displayDates.length + 1}, minmax(0, 1fr))`,
              display: 'grid',
              gap: '1rem',
            }}
          >
            {/* Header Row */}
            <div className="font-semibold text-center py-3 border-b border-gray-300 text-base">
              {t('Staff')}
            </div>
            {displayDates.map((date, index) => (
              <div
                key={index}
                className="text-center font-semibold text-sm py-3 border-b border-gray-300"
              >
                {date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  day: 'numeric',
                })}
              </div>
            ))}

            {/* Staff Rows */}
            {filter === 'All'
              ? Object.entries(groupStaffByRole(staffList)).map(([role, staffArray]) => (
                  <React.Fragment key={role}>
                    <div className="col-span-full bg-gray-300 py-2 px-4 text-gray-800 font-semibold rounded-md my-2">
                      {role}
                    </div>
                    {staffArray.map((staff) => {
  const totalHours = calculateTotalWeeklyHours(staff.id);
  const isHourly = staff.salary_model === 'hourly';
  const salaryDisplay = isHourly
    ? `₺${(staff.hourly_rate * totalHours).toFixed(2)}`
    : `₺${staff.salary}`;

  return (
    <React.Fragment key={staff.id}>
      <div
        onClick={() => handleEditStaffProfile(staff)}
        className="p-5 font-medium text-center bg-white/90 rounded-md shadow hover:shadow-md cursor-pointer transition transform hover:-translate-y-0.5"
      >
        <div className="text-base font-bold text-gray-800">{staff.name}</div>
        <div className="text-sm text-gray-600">
          {staff.role} | <span className="text-red-500">{totalHours}h</span> | {salaryDisplay}
        </div>
      </div>

      {displayDates.map((date, idx) => {
        const dayAbbrev = date.toLocaleDateString('en-US', { weekday: 'short' });

        const schedule = staffSchedules.find((sched) => {
          if (sched.staff_id !== staff.id) return false;
          if (sched.shift_date) return isSameDay(new Date(sched.shift_date), date);
          return formatDays(sched.days).includes(dayAbbrev);
        });

        return (
          <Droppable key={`${staff.id}-${idx}`} droppableId={`${staff.id}-${idx}`}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                onClick={() => {
                  if (!schedule) {
                    if (copiedShift) {
                      handlePasteShift(staff, date);
                    } else {
                      handleCardClick(staff, date);
                    }
                  }
                }}
                className={`
                  flex items-center justify-center
                  p-2 text-center rounded-md shadow border cursor-pointer transition transform hover:scale-105
                  ${
                    schedule
                      ? 'bg-gradient-to-r from-green-400 to-green-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }
                `}
              >
                {schedule ? (
                  <Draggable draggableId={`shift-${schedule.id}`} index={0}>
                    {(draggableProvided) => (
                      <div
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        {...draggableProvided.dragHandleProps}
                        className="cell-content flex flex-col items-center gap-2"
                      >
                        <div className="text-sm font-bold">
                          {`${schedule.shift_start.substring(0, 5)} - ${schedule.shift_end.substring(0, 5)}`}
                        </div>
                        <div className="text-sm font-bold">
                          <span className="text-red-900">
                            {calculateShiftDuration(schedule.shift_start, schedule.shift_end)}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyShift(schedule);
                            }}
                            className="underline"
                          >
                             {t('Copy')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const dayString = date.toLocaleDateString('en-US', { weekday: 'short' });
                              handleDeleteShiftDayForCell(schedule.id, dayString);
                            }}
                            className="underline"
                          >
                             {t('Del')}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardClick(staff, date);
                            }}
                            className="underline"
                          >
                            {t('Edit')}
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ) : (
                  <div className="cell-content text-sm">{t('No Shift')}</div>
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        );
      })}
    </React.Fragment>
  );
})}

                  </React.Fragment>
                ))
              : staffList
                  .filter(
                    (staff) =>
                      filter === 'All' ||
                      staff.role.toLowerCase() === filter.toLowerCase()
                  )
                  .map((staff) => (
                    <React.Fragment key={staff.id}>
                      <div
                        onClick={() => handleEditStaffProfile(staff)}
                        className="p-5 font-medium text-center bg-white/90 rounded-md shadow hover:shadow-md cursor-pointer transition transform hover:-translate-y-0.5"
                      >
                        <div className="text-base font-bold text-gray-800">
                          {staff.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {(() => {
  const totalHours = calculateTotalWeeklyHours(staff.id);
  const isHourly = staff.salary_model === 'hourly';
  const salaryDisplay = isHourly
    ? `₺${(staff.hourly_rate * totalHours).toFixed(2)}`
    : `₺${staff.salary}`;
  return (
    <>
      {staff.role} | <span className="text-red-500">{totalHours}h</span> | {salaryDisplay}
    </>
  );
})()}

                        </div>
                      </div>
                      {displayDates.map((date, idx) => {
                        const dayAbbrev = date.toLocaleDateString('en-US', { weekday: 'short' });
                        const schedule = staffSchedules.find((sched) => {
  if (sched.staff_id !== staff.id) return false;

  if (sched.shift_date)
    return isSameDay(new Date(sched.shift_date), date);

  return formatDays(sched.days).includes(dayAbbrev);
});

                        return (
                          <Droppable
                            key={`${staff.id}-${idx}`}
                            droppableId={`${staff.id}-${idx}`}
                          >
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                onClick={() => {
                                  if (!schedule) {
                                    if (copiedShift) {
                                      handlePasteShift(staff, date);
                                    } else {
                                      handleCardClick(staff, date);
                                    }
                                  }
                                }}
                                className={`
                                  min-w-[120px] min-h-[80px]
                                  flex items-center justify-center
                                  p-4 text-center rounded-md shadow border cursor-pointer transition transform hover:scale-105
                                  ${
                                    schedule
                                      ? 'bg-gradient-to-r from-green-400 to-green-600 text-white'
                                      : 'bg-gray-100 text-gray-700'
                                  }
                                `}
                              >
{schedule ? (
  <Draggable draggableId={`shift-${schedule.id}`} index={0}>
    {(draggableProvided) => (
      <div
        ref={draggableProvided.innerRef}
        {...draggableProvided.draggableProps}
        {...draggableProvided.dragHandleProps}
      >
        <div className="cell-content">
          <div className="text-sm font-bold">
            {`${schedule.shift_start.substring(0, 5)} - ${schedule.shift_end.substring(0, 5)}`}
          </div>
          <div className="text-sm font-bold">
            {calculateShiftDuration(schedule.shift_start, schedule.shift_end)}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyShift(schedule);
            }}
            className="text-xs underline"
          >
            Copy
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteShiftById(schedule.id);
            }}
            className="text-xs underline ml-2"
          >
            Del
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // This calls handleCardClick to edit the shift
              handleCardClick(staff, date);
            }}
            className="text-xs underline ml-2"
          >
            Edit
          </button>
        </div>
      </div>
    )}
  </Draggable>
) : (
  <div className="cell-content text-sm">
    No Shift
  </div>
)}

                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        );
                      })}
                    </React.Fragment>
                  ))}
          </div>
        </div>
      </DragDropContext>

      {/* SHIFT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-md"
      >
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg mx-auto transform transition-all duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
                 {t('Edit Shift')} {selectedShift?.staff?.name}
            </h2>
            <button
              onClick={() => setIsModalOpen(false)}
              className="p-3 rounded-full bg-gray-200 hover:bg-gray-300 transition"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>
          <div className="space-y-6">
            <label className="block text-gray-700 font-semibold">
  {t('Select Days')} {/* Translated Select Days label */}
</label>
            <div className="grid grid-cols-4 gap-3">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
  <button
    key={day}
    onClick={() => toggleDaySelection(day)}
    className={`px-4 py-2 rounded-full transition ${
      selectedDays.includes(day)
        ? 'bg-blue-600 text-white'
        : 'bg-gray-200 text-gray-800'
    } hover:shadow-md`}
  >
    {t(day)} {/* Translated day */}
  </button>
))}

            </div>
           <label className="block text-gray-700 font-semibold">
  {t('Start Time')} {/* Translated Start Time label */}
</label>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DesktopTimePicker
  label={t('Start Time')}
  value={timeStringToDate(startTime)}
  onChange={(newValue) => handleTimeChange(newValue, setStartTime)}
  ampm={false}
  slotProps={{ textField: { fullWidth: true } }}
/>

            </LocalizationProvider>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DesktopTimePicker
                 label={t('End Time')}
                value={timeStringToDate(endTime)}
                onChange={(newValue) => handleTimeChange(newValue, setEndTime)}
                ampm={false}
                inputFormat="HH:mm"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ ...params.inputProps, placeholder: "HH:mm" }}
                  />
                )}
              />
            </LocalizationProvider>
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 rounded-lg text-gray-700 bg-gray-300 hover:bg-gray-400 transition"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={() => handleDeleteShiftDay(selectedShift?.id, selectedDays[0])}
                className="flex-1 py-3 rounded-lg text-white bg-red-500 hover:bg-red-600 transition shadow-md"
              >
                {t('Delete')}
              </button>
              <button
                onClick={handleSaveShift}
                className="flex-1 py-3 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition shadow-md"
              >
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      </Modal>

<Modal
  isOpen={isProfileModalOpen}
  onRequestClose={() => setIsProfileModalOpen(false)}
  className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-md"
>
  <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md mx-auto 
                  max-h-[75vh] overflow-y-auto transition-all">
    {/* Header */}
    <div className="flex justify-between items-center mb-5">
      <h2 className="text-lg font-semibold text-gray-800">
        Edit Profile: {selectedStaffProfile?.name}
      </h2>
      <button
        onClick={() => setIsProfileModalOpen(false)}
        className="p-2 rounded-full bg-gray-200 hover:bg-gray-300"
      >
        <X size={20} className="text-gray-600" />
      </button>
    </div>
<div className="flex justify-end mb-4 gap-2">
  <button
    onClick={() => fetchAllSchedules(selectedStaffProfile.id)}
    className="px-3 py-2 rounded bg-blue-600 text-white text-sm shadow hover:bg-blue-700"
  >
    View All Schedules
  </button>
</div>

    {/* Form Fields */}
    <div className="space-y-3 text-sm">
      {[
        ['Name', 'name'],
        ['Role', 'role'],
        ['Phone', 'phone'],
        ['Address', 'address'],
        ['Email', 'email', 'email'],
      ].map(([label, key, type = 'text']) => (
        <div key={key}>
          <label className="block font-medium text-gray-700">{label}:</label>
          <input
            type={type}
            value={selectedStaffProfile?.[key] || ''}
            onChange={(e) =>
              setSelectedStaffProfile({ ...selectedStaffProfile, [key]: e.target.value })
            }
            className="w-full p-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      ))}

      {/* Payment Type */}
      <div>
        <label className="block font-medium text-gray-700">Payment Type:</label>
        <select
          value={selectedStaffProfile?.payment_type || 'daily'}
          onChange={(e) =>
            setSelectedStaffProfile({ ...selectedStaffProfile, payment_type: e.target.value })
          }
          className="w-full p-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="daily">{t('Daily')}</option>
          <option value="weekly">{t('Weekly')}</option>
          <option value="monthly">{t('Monthly')}</option>
        </select>
      </div>

      {/* Salary Model */}
      <div>
        <label className="block font-medium text-gray-700">Salary Model:</label>
        <select
          value={selectedStaffProfile?.salary_model ?? 'fixed'}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedStaffProfile((prev) => ({
              ...prev,
              salary_model: value,
              hourly_rate: value === 'hourly' ? prev.salary || '' : '',
              salary: value === 'fixed' ? prev.salary || '' : '',
            }));
          }}
          className="w-full p-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="fixed">Fixed</option>
          <option value="hourly">Hourly</option>
        </select>
      </div>

      {/* Salary / Hourly Rate */}
      <div>
        <label className="block font-medium text-gray-700">
          {selectedStaffProfile?.salary_model === 'hourly' ? 'Hourly Rate' : 'Salary'}:
        </label>
        <input
          type="number"
          value={
            selectedStaffProfile?.salary_model === 'hourly'
              ? selectedStaffProfile?.hourly_rate || ''
              : selectedStaffProfile?.salary || ''
          }
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setSelectedStaffProfile((prev) => ({
              ...prev,
              salary_model: prev.salary_model || 'fixed',
              salary: prev.salary_model === 'hourly' ? prev.salary : val,
              hourly_rate: prev.salary_model === 'hourly' ? val : '',
            }));
          }}
          className="w-full p-2 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    </div>

    {/* Footer Buttons */}
    <div className="flex justify-end gap-2 pt-4">
      <button
        onClick={() => setIsProfileModalOpen(false)}
        className="px-4 py-2 rounded-md bg-gray-300 hover:bg-gray-400 text-sm"
      >
        {t('Cancel')}
      </button>
      <button
        onClick={handleSaveProfile}
        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
      >
        {t('Save')}
      </button>
    </div>
  </div>
</Modal>

<Modal
  isOpen={isAllSchedulesOpen}
  onRequestClose={() => setIsAllSchedulesOpen(false)}
  className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50"
>
  <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
    <h2 className="text-xl font-bold mb-4">All Schedules</h2>
    {allSchedules.length > 0 ? (
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Date</th>
            <th className="p-2">Day(s)</th>
            <th className="p-2">Shift</th>
          </tr>
        </thead>
        <tbody>
          {allSchedules.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.shift_date}</td>
              <td className="p-2">{Array.isArray(s.days) ? s.days.join(', ') : s.days}</td>
              <td className="p-2">{s.shift_start} - {s.shift_end}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p>No schedules found</p>
    )}
    <div className="flex justify-end gap-2 mt-4">
      <button
        onClick={() => setIsAllSchedulesOpen(false)}
        className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
      >
        Close
      </button>
      <button
    onClick={async () => {
  if (window.confirm("Delete ALL schedules for this staff?")) {
    await secureFetch(`/staff/${selectedStaffProfile.id}/schedule`, {
      method: "DELETE",
    });
    toast.success("All schedules deleted");
    setIsAllSchedulesOpen(false);
    fetchStaffSchedules(); // refresh weekly grid
  }
}}
className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
>

        Delete All
      </button>
    </div>
  </div>
</Modal>

    </div>
  );
};

export default StaffSchedule;
