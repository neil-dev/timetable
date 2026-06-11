'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  Search, 
  Check, 
  Copy, 
  Download, 
  Sun, 
  Moon, 
  X,
  RefreshCw,
  List,
  Grid,
  UploadCloud,
  FileText,
  ArrowUp,
  Bus,
  Utensils,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle
} from 'lucide-react';
import busScheduleData from '../../busSchedule.json';

interface Course {
  name: string;
  abbr: string;
  sections?: string[];
  credits?: number;
}

interface TimetableEvent {
  start: string;
  end: string;
  summary: string;
  location: string;
  description: string;
  dateStr: string;
  isoDate?: string;  // YYYY-MM-DD – reliable date key added by API
  timeSlot: string;
  room: string;
  abbr: string;
  section?: string;
  courseName: string;
  isCancelled?: boolean;
}

// Helper: Get Current Time in Indian Standard Time (IST)
const getIstNow = () => {
  try {
    const now = new Date();
    // Format to get individual components in Asia/Kolkata timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const getVal = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    
    const year = getVal('year');
    const month = getVal('month') - 1; // 0-indexed month
    const day = getVal('day');
    const hour = getVal('hour');
    const minute = getVal('minute');
    const second = getVal('second');
    
    // Construct a new Date using local components
    return new Date(year, month, day, hour, minute, second);
  } catch {
    return new Date();
  }
};

// Helper: Get Today's Day of the Week in IST (uppercase)
const getTodayDayName = () => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    return formatter.format(new Date()).toUpperCase();
  } catch {
    return days[getIstNow().getDay()];
  }
};

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  // selectedCourses holds: { [abbr]: selectedSection (e.g. 'A', 'B' or '') }
  const [selectedCourses, setSelectedCourses] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [toastMessage, setToastMessage] = useState('');
  const [origin, setOrigin] = useState('');
  const [allTimeSlots, setAllTimeSlots] = useState<string[]>([]);
  const [showPdfImportAlert, setShowPdfImportAlert] = useState(false);

  // Dashboard Tabs & Extra States
  const [currentTab, setCurrentTab] = useState<'timetable' | 'bus' | 'mess'>('timetable');
  const [busSearchQuery, setBusSearchQuery] = useState('');
  const [busRefreshTime, setBusRefreshTime] = useState<Date | null>(null);
  
  const [messMenuData, setMessMenuData] = useState<any>(null);
  const [loadingMessMenu, setLoadingMessMenu] = useState(false);
  const [messMenuError, setMessMenuError] = useState('');
  const [messMenuDay, setMessMenuDay] = useState('');
  const [isDayDropdownOpen, setIsDayDropdownOpen] = useState(false);
  const dayDropdownRef = useRef<HTMLDivElement>(null);

  // Initialize Bus Time and Calendar Week on Mount
  useEffect(() => {
    const nowIst = getIstNow();
    setBusRefreshTime(nowIst);
  }, []);

  // Click outside to close custom day selection dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(event.target as Node)) {
        setIsDayDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // PDF Upload & Parse States
  const [parsingPdf, setParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const calendarWrapperRef = useRef<HTMLDivElement>(null);

  // Generation & Preview States
  const [generating, setGenerating] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<TimetableEvent[] | null>(null);
  const [previewTab, setPreviewTab] = useState<'list' | 'calendar'>('calendar');
  const [listFilter, setListFilter] = useState<'today' | 'week' | 'full'>('full');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Individual Course Syllabus/Schedule Modal States
  const [activeCourseScheduleAbbr, setActiveCourseScheduleAbbr] = useState<string | null>(null);
  const [courseScheduleEvents, setCourseScheduleEvents] = useState<TimetableEvent[] | null>(null);
  const [loadingCourseSchedule, setLoadingCourseSchedule] = useState(false);

  // Scroll to Top state
  const [showScrollTop, setShowScrollTop] = useState(false);

  // PWA Install Prompt States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  // Register window scroll listener for Scroll to Top button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // PWA Install Listener & Setup
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isDismissed = localStorage.getItem('timetable_install_dismissed') === 'true';

    if (isStandalone || isDismissed) return;

    // Detect mobile or tablet viewports
    const isMobileOrTablet = window.innerWidth <= 1024;
    if (!isMobileOrTablet) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDetected = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDetected);

    if (iosDetected) {
      setShowInstallBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Accessibility Font Size Checker
  useEffect(() => {
    const checkFontSize = () => {
      const htmlEl = document.documentElement;
      const computedSize = parseFloat(window.getComputedStyle(htmlEl).fontSize);
      if (computedSize >= 18) {
        htmlEl.classList.add('accessibility-large-text');
        const scale = computedSize / 16;
        htmlEl.style.setProperty('--font-scale-factor', scale.toString());
      } else {
        htmlEl.classList.remove('accessibility-large-text');
        htmlEl.style.setProperty('--font-scale-factor', '1');
      }
    };

    checkFontSize();
    window.addEventListener('resize', checkFontSize);
    return () => window.removeEventListener('resize', checkFontSize);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowInstallBanner(false);
        }
      } catch (err) {
        console.error('PWA install error:', err);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismissBanner = () => {
    localStorage.setItem('timetable_install_dismissed', 'true');
    setShowInstallBanner(false);
  };
  
  // Show a visual toast message
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  // Fetch Mess Menu once when tab switches to 'mess'
  useEffect(() => {
    if (currentTab !== 'mess' || messMenuData) return;

    const fetchMenu = async () => {
      try {
        setLoadingMessMenu(true);
        setMessMenuError('');
        const res = await fetch('/api/mess-menu');
        if (!res.ok) {
          throw new Error('Failed to fetch mess menu');
        }
        const data = await res.json();
        setMessMenuData(data);
      } catch (err: any) {
        setMessMenuError(err.message || 'Error loading mess menu');
      } finally {
        setLoadingMessMenu(false);
      }
    };

    fetchMenu();
  }, [currentTab, messMenuData]);

  // Set default day when messMenuData loads
  useEffect(() => {
    if (messMenuData && !messMenuDay) {
      setMessMenuDay(getTodayDayName());
    }
  }, [messMenuData, messMenuDay]);

  // Weekly Calendar Navigation Date State (Monday of active week)
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() => {
    // Return a stable fallback date for initial SSR to avoid hydration mismatch
    return new Date('2026-06-08T00:00:00+05:30');
  });

  // Calculate actual week start on client mount
  useEffect(() => {
    const nowIst = getIstNow();
    const today = new Date(nowIst);
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    setCalendarWeekStart(monday);
  }, []);

  // Auto-scroll calendar view to the current day on mobile/tablet viewports
  useEffect(() => {
    if (previewTab !== 'calendar' || !generatedEvents) return;

    // Use a short delay to allow DOM calculations to settle
    const timer = setTimeout(() => {
      const wrapper = calendarWrapperRef.current;
      const todayEl = wrapper?.querySelector('.today-highlight') as HTMLElement;
      if (wrapper && todayEl) {
        const wrapperWidth = wrapper.clientWidth;
        const todayLeft = todayEl.offsetLeft;
        const todayWidth = todayEl.clientWidth;
        
        // Sticky Time Slot column width is 100px
        const stickyWidth = 100;
        
        // Horizontal scroll position to center the current day column in the remaining scrollable area:
        // targetScrollLeft = todayLeft - stickyWidth - (wrapperWidth - stickyWidth - todayWidth) / 2
        const targetScrollLeft = todayLeft - stickyWidth - (wrapperWidth - stickyWidth - todayWidth) / 2;
        
        wrapper.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth'
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [previewTab, generatedEvents, calendarWeekStart]);

  // Get current origin for subscription link
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
      
      // Initialize theme from localStorage or default to dark
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const initialTheme = savedTheme || 'dark';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  // Fetch Courses list from backend and handle initial URL parameter loading + local storage caching
  useEffect(() => {
    const fetchCourses = async () => {
      let cachedCourses: Course[] = [];
      let loadedInitialSelection = false;

      // 1. Try to read courses from cache first to show options instantly
      if (typeof window !== 'undefined') {
        try {
          const cachedCoursesStr = localStorage.getItem('courses_cache');
          if (cachedCoursesStr) {
            const parsed = JSON.parse(cachedCoursesStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              cachedCourses = parsed;
              setCourses(parsed);
              setLoading(false); // Stop loading skeleton since we have cached data
            }
          }
        } catch (e) {
          console.error('Failed to parse courses_cache:', e);
        }
      }

      // Helper to fetch events for a selection
      const fetchEventsForSelection = async (selection: Record<string, string>) => {
        try {
          setGenerating(true);
          const genParams = new URLSearchParams();
          Object.entries(selection).forEach(([abbr, section]) => {
            const val = section ? `${abbr}:${section}` : abbr;
            genParams.append('courses', val);
          });
          genParams.append('format', 'json');

          const genRes = await fetch(`/api/timetable?${genParams.toString()}`);
          if (genRes.ok) {
            const genData = await genRes.json();
            setGeneratedEvents(genData.events || []);
            if (genData.allTimeSlots) {
              setAllTimeSlots(genData.allTimeSlots);
            }
          }
        } catch (e) {
          console.error('Failed to auto-generate timetable:', e);
        } finally {
          setGenerating(false);
        }
      };

      // 2. Resolve initial selection (URL parameters take precedence over localStorage)
      if (typeof window !== 'undefined') {
        try {
          const params = new URLSearchParams(window.location.search);
          const selectionParam = params.get('selection') || params.get('courses');
          
          if (selectionParam) {
            const parts = selectionParam.split(',').map(s => s.trim()).filter(Boolean);
            const newSelection: Record<string, string> = {};
            const activeCoursesList = cachedCourses.length > 0 ? cachedCourses : [];
            
            parts.forEach(part => {
              const subParts = part.split(':');
              const nameOrAbbr = subParts[0].trim();
              const section = subParts[1] ? subParts[1].trim() : '';
              
              const course = activeCoursesList.find(
                (c: any) => c.abbr.toLowerCase() === nameOrAbbr.toLowerCase() ||
                             c.name.toLowerCase() === nameOrAbbr.toLowerCase()
              );
              
              if (course) {
                const sections = course.sections || [];
                let targetSec = section;
                if (sections.length > 0 && !sections.includes(targetSec)) {
                  targetSec = sections[0];
                }
                newSelection[course.abbr] = targetSec;
              }
            });

            if (Object.keys(newSelection).length > 0) {
              setSelectedCourses(newSelection);
              loadedInitialSelection = true;
              fetchEventsForSelection(newSelection);
              showToast('Timetable loaded from link!');
            }
          } else {
            // Fall back to localStorage selection
            const cachedSelectionStr = localStorage.getItem('selectedCourses');
            if (cachedSelectionStr) {
              const cachedSelection = JSON.parse(cachedSelectionStr);
              if (cachedSelection && Object.keys(cachedSelection).length > 0) {
                setSelectedCourses(cachedSelection);
                loadedInitialSelection = true;
                fetchEventsForSelection(cachedSelection);
                showToast('Restored last selection');
              }
            }
          }
        } catch (e) {
          console.error('Failed to load selection from URL/cache:', e);
        }
      }

      // 3. Fetch fresh courses from API in background (stale-while-revalidate)
      try {
        if (cachedCourses.length === 0) {
          setLoading(true);
        }
        const res = await fetch('/api/timetable?get_courses=true');
        if (!res.ok) {
          throw new Error('Failed to retrieve course details sheet');
        }
        const data = await res.json();
        const fetchedCourses: Course[] = data.courses || [];
        
        setCourses(fetchedCourses);
        if (typeof window !== 'undefined') {
          localStorage.setItem('courses_cache', JSON.stringify(fetchedCourses));
        }

        // If URL params are present but were not mapped correctly because cached courses were empty on mount, resolve now
        if (!loadedInitialSelection && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const selectionParam = params.get('selection') || params.get('courses');
          
          if (selectionParam) {
            const parts = selectionParam.split(',').map(s => s.trim()).filter(Boolean);
            const newSelection: Record<string, string> = {};
            
            parts.forEach(part => {
              const subParts = part.split(':');
              const nameOrAbbr = subParts[0].trim();
              const section = subParts[1] ? subParts[1].trim() : '';
              
              const course = fetchedCourses.find(
                (c: any) => c.abbr.toLowerCase() === nameOrAbbr.toLowerCase() ||
                             c.name.toLowerCase() === nameOrAbbr.toLowerCase()
              );
              
              if (course) {
                const sections = course.sections || [];
                let targetSec = section;
                if (sections.length > 0 && !sections.includes(targetSec)) {
                  targetSec = sections[0];
                }
                newSelection[course.abbr] = targetSec;
              }
            });

            if (Object.keys(newSelection).length > 0) {
              setSelectedCourses(newSelection);
              fetchEventsForSelection(newSelection);
              showToast('Timetable loaded from link!');
            }
          }
        }
      } catch (err: any) {
        if (cachedCourses.length === 0) {
          setError(err.message || 'Error connecting to Google Sheets API');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  // Toggle Theme
  const toggleTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    showToast(`Switched to ${newTheme} mode`);
  };

  // Toggle Single Course Selection
  const toggleCourse = (abbr: string) => {
    setSelectedCourses(prev => {
      const copy = { ...prev };
      if (copy[abbr] !== undefined) {
        delete copy[abbr];
      } else {
        const found = courses.find(c => c.abbr === abbr);
        const secs = found?.sections || [];
        copy[abbr] = secs.length > 0 ? secs[0] : '';
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedCourses', JSON.stringify(copy));
      }
      return copy;
    });
    setGeneratedEvents(null);
  };

  // Change specific section of a selected course
  const changeCourseSection = (abbr: string, section: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling/deselecting the course card
    setSelectedCourses(prev => {
      const next = {
        ...prev,
        [abbr]: section
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedCourses', JSON.stringify(next));
      }
      return next;
    });
    setGeneratedEvents(null);
  };

  // Select All matching courses
  const handleSelectAll = () => {
    setSelectedCourses(prev => {
      const copy = { ...prev };
      filteredCourses.forEach(c => {
        if (copy[c.abbr] === undefined) {
          copy[c.abbr] = c.sections && c.sections.length > 0 ? c.sections[0] : '';
        }
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedCourses', JSON.stringify(copy));
      }
      return copy;
    });
    setGeneratedEvents(null);
    showToast(`Selected all matching courses`);
  };

  // Clear Selection
  const handleClearSelection = () => {
    setSelectedCourses({});
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedCourses');
      window.history.pushState(null, '', window.location.pathname);
    }
    setGeneratedEvents(null);
    showToast(`Cleared selection`);
  };

  // PDF file upload upload handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      showToast('Error: Please upload a PDF file.');
      return;
    }

    try {
      setParsingPdf(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to parse PDF.');
      }

      const data = await res.json();
      const selections = data.selections || [];

      if (selections.length === 0) {
        showToast('No matching Term IV courses found in the PDF.');
        return;
      }

      // Update state
      setSelectedCourses(prev => {
        const copy = { ...prev };
        selections.forEach((sel: any) => {
          const course = courses.find(c => c.abbr === sel.abbr);
          const sections = course?.sections || [];
          let targetSec = sel.section || '';
          
          if (sections.length > 0 && !sections.includes(targetSec)) {
            // Fallback to first section if parsed section is not found in sheet
            targetSec = sections[0];
          }
          copy[sel.abbr] = targetSec;
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('selectedCourses', JSON.stringify(copy));
        }
        return copy;
      });
      setGeneratedEvents(null);

      showToast(`Auto-selected ${selections.length} courses from PDF!`);
      setShowPdfImportAlert(true);
    } catch (err: any) {
      showToast(`PDF Import Error: ${err.message}`);
    } finally {
      setParsingPdf(false);
      e.target.value = ''; // Reset input
    }
  };

  // Filter Courses based on search
  const filteredCourses = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return courses;
    return courses.filter(
      c => c.name.toLowerCase().includes(query) || c.abbr.toLowerCase().includes(query)
    );
  }, [courses, searchQuery]);

  // Construct selected courses list metadata
  const selectedCoursesInfo = useMemo(() => {
    return Object.entries(selectedCourses)
      .map(([abbr, section]) => {
        const found = courses.find(c => c.abbr === abbr);
        return {
          abbr,
          name: found ? found.name : abbr,
          section
        };
      })
      .sort((a, b) => a.abbr.localeCompare(b.abbr));
  }, [selectedCourses, courses]);

  // Fetch timetable preview JSON from the backend
  const handleGenerateTimetable = async () => {
    if (selectedCoursesInfo.length === 0) return;
    try {
      setGenerating(true);
      const params = new URLSearchParams();
      selectedCoursesInfo.forEach(item => {
        const val = item.section ? `${item.abbr}:${item.section}` : item.abbr;
        params.append('courses', val);
      });
      params.append('format', 'json');

      const res = await fetch(`/api/timetable?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch timetable events');
      }
      
      const data = await res.json();
      setGeneratedEvents(data.events || []);
      if (data.allTimeSlots) {
        setAllTimeSlots(data.allTimeSlots);
      }
      showToast('Timetable generated successfully!');

      // Update URL to match current selection
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams();
        const selection = selectedCoursesInfo
          .map(item => (item.section ? `${item.abbr}:${item.section}` : item.abbr))
          .join(',');
        urlParams.set('selection', selection);
        window.history.pushState(null, '', `${window.location.pathname}?${urlParams.toString()}`);
      }
      
      // Scroll to top smoothly so they see the timetable at the top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // 7 days of the active calendar week (Monday to Sunday)
  const activeWeekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(calendarWeekStart);
      d.setDate(calendarWeekStart.getDate() + i);
      // Build a reliable YYYY-MM-DD key for date comparison
      const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: d,
        dayName: d.toLocaleDateString('en-US', { weekday: 'long' }),
        formatted: d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
        dateStr: d.toDateString(),
        isoDate,
      });
    }
    return days;
  }, [calendarWeekStart]);

  // List View Filtered events based on Today / This Week / Full Term selection
  const filteredEventsForList = useMemo(() => {
    if (!generatedEvents) return [];
    
    // Build today's ISO date (YYYY-MM-DD) in IST
    const now = getIstNow();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Build start/end of current ISO week (Mon–Sun) in IST
    const dayOfWeek = now.getDay(); // 0 = Sun
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monDate = new Date(now);
    monDate.setDate(now.getDate() + diffToMonday);
    const sunDate = new Date(monDate);
    sunDate.setDate(monDate.getDate() + 6);
    const weekStartISO = `${monDate.getFullYear()}-${String(monDate.getMonth() + 1).padStart(2, '0')}-${String(monDate.getDate()).padStart(2, '0')}`;
    const weekEndISO   = `${sunDate.getFullYear()}-${String(sunDate.getMonth() + 1).padStart(2, '0')}-${String(sunDate.getDate()).padStart(2, '0')}`;
    
    const events = generatedEvents.filter(e => {
      // Use isoDate from API when available; fall back to parsing start timestamp
      const eISO = e.isoDate || e.start.split('T')[0];
      
      if (listFilter === 'today') {
        return eISO === todayISO;
      } else if (listFilter === 'week') {
        return eISO >= weekStartISO && eISO <= weekEndISO;
      }
      return true; // full term
    });

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return events;
  }, [generatedEvents, listFilter]);

  // Helper: group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, TimetableEvent[]> = {};
    filteredEventsForList.forEach(e => {
      if (!groups[e.dateStr]) {
        groups[e.dateStr] = [];
      }
      groups[e.dateStr].push(e);
    });
    return groups;
  }, [filteredEventsForList]);

  // URLs for exporting
  const downloadUrl = useMemo(() => {
    if (selectedCoursesInfo.length === 0) return '#';
    const params = new URLSearchParams();
    selectedCoursesInfo.forEach(item => {
      const val = item.section ? `${item.abbr}:${item.section}` : item.abbr;
      params.append('courses', val);
    });
    return `/api/timetable?${params.toString()}`;
  }, [selectedCoursesInfo]);

  const subscriptionUrl = useMemo(() => {
    if (selectedCoursesInfo.length === 0) return '';
    const params = new URLSearchParams();
    selectedCoursesInfo.forEach(item => {
      const val = item.section ? `${item.abbr}:${item.section}` : item.abbr;
      params.append('courses', val);
    });
    return `${origin}/api/timetable?${params.toString()}`;
  }, [selectedCoursesInfo, origin]);

  const shareableLink = useMemo(() => {
    if (selectedCoursesInfo.length === 0) return '';
    const params = new URLSearchParams();
    const selection = selectedCoursesInfo
      .map(item => (item.section ? `${item.abbr}:${item.section}` : item.abbr))
      .join(',');
    params.set('selection', selection);
    return `${origin}/?${params.toString()}`;
  }, [selectedCoursesInfo, origin]);

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && subscriptionUrl) {
      navigator.clipboard.writeText(subscriptionUrl);
      showToast('Live calendar subscription URL copied!');
    }
  };

  const handleCopyShareableLink = () => {
    if (typeof navigator !== 'undefined' && shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      showToast('Shareable combination link copied!');
    }
  };


  // Resolve currently active syllabus course details
  const activeScheduleCourse = useMemo(() => {
    if (!activeCourseScheduleAbbr) return null;
    return courses.find(c => c.abbr === activeCourseScheduleAbbr);
  }, [activeCourseScheduleAbbr, courses]);

  // Load and display full term schedule for a selected course on-click
  const handleViewCourseSchedule = async (abbr: string, section: string) => {
    try {
      setActiveCourseScheduleAbbr(abbr);
      setLoadingCourseSchedule(true);
      setCourseScheduleEvents(null);

      const val = section ? `${abbr}:${section}` : abbr;
      const res = await fetch(`/api/timetable?courses=${val}&format=json`);
      if (res.ok) {
        const data = await res.json();
        setCourseScheduleEvents(data.events || []);
      } else {
        showToast('Failed to retrieve course schedule');
      }
    } catch {
      showToast('Error connecting to database');
    } finally {
      setLoadingCourseSchedule(false);
    }
  };

  // Calculate progress stats for the active course schedule modal
  const courseProgressStats = useMemo(() => {
    if (!courseScheduleEvents) return { completed: 0, total: 0, percentage: 0 };
    const now = new Date();
    const courseCredits = activeScheduleCourse?.credits ?? 3;
    const maxFormulaClasses = courseCredits * 8;
    
    const activeEvents = courseScheduleEvents.filter(e => !e.isCancelled);
    const totalValidClasses = activeEvents.length;
    
    const cappedTotalClasses = Math.min(totalValidClasses, maxFormulaClasses);
    const completedCount = activeEvents.filter(e => {
      const startTime = new Date(e.start);
      return !isNaN(startTime.getTime()) && startTime < now;
    }).length;
    
    const cappedCompletedCount = Math.min(completedCount, cappedTotalClasses);
    const percentage = cappedTotalClasses > 0 ? Math.round((cappedCompletedCount / cappedTotalClasses) * 100) : 0;
    
    return {
      completed: cappedCompletedCount,
      total: cappedTotalClasses,
      percentage
    };
  }, [courseScheduleEvents, activeScheduleCourse]);

  // Weekly Calendar Navigation Handlers
  const handlePrevWeek = () => {
    setCalendarWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCalendarWeekStart(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const handleJumpToCurrentWeek = () => {
    const today = getIstNow();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    setCalendarWeekStart(monday);
  };

  const getWeekday = (dateStr: string) => {
    return dateStr.split(',')[0].trim();
  };


  const timeSlots = useMemo(() => {
    let slots = allTimeSlots.length > 0 ? [...allTimeSlots] : [];
    if (slots.length === 0 && generatedEvents) {
      slots = Array.from(new Set(generatedEvents.map(e => e.timeSlot)));
    }
    
    // Filter slots based on user requirements:
    slots = slots.filter(slot => {
      const normalizedSlot = slot.trim().replace(/\s+/g, '').replace(/\./g, ':');
      
      // 1. Exclude the 13:30-14:30 slot
      if (normalizedSlot === '13:30-14:30') {
        return false;
      }
      
      // 2. Only show 22:00-23:15 if the user has a course in that slot
      if (normalizedSlot === '22:00-23:15') {
        if (!generatedEvents) return false;
        return generatedEvents.some(e => {
          const eSlotNormalized = e.timeSlot.trim().replace(/\s+/g, '').replace(/\./g, ':');
          return eSlotNormalized === '22:00-23:15';
        });
      }
      
      return true;
    });

    return slots.sort((a, b) => {
      const aStart = a.split('-')[0].trim().replace(/\./g, ':');
      const bStart = b.split('-')[0].trim().replace(/\./g, ':');
      return aStart.localeCompare(bStart);
    });
  }, [allTimeSlots, generatedEvents]);

  // ----------------------------------------------------
  // Bus Schedule Memos & Helper
  // ----------------------------------------------------
  const getBusMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().toUpperCase().split(/\s+/);
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    const [hoursStr, minutesStr] = time.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    
    if (modifier === 'PM' && hours < 12) {
      hours += 12;
    }
    if (modifier === 'AM' && hours === 12) {
      hours = 24; // Treated as end of day
    }
    return hours * 60 + minutes;
  };

  const sortedBuses = useMemo(() => {
    const transformed = busScheduleData.map(b => {
      if (b.tripsExtendedToMainGate && b.tripsExtendedToMainGate.trim() !== "") {
        // tripsExtendedToMainGate becomes the To column entry
        // and the other two (original via and original to) are the via spots
        const originalVia = b.via ? b.via.trim() : "";
        const originalTo = b.to ? b.to.trim() : "";
        
        let newVia = "";
        if (originalVia && originalTo) {
          newVia = `${originalVia}, ${originalTo}`;
        } else {
          newVia = originalVia || originalTo;
        }
        
        return {
          ...b,
          to: b.tripsExtendedToMainGate.trim(),
          via: newVia,
          tripsExtendedToMainGate: ""
        };
      }
      return b;
    });
    return transformed.sort((a, b) => getBusMinutes(a.time) - getBusMinutes(b.time));
  }, []);

  const busCalculations = useMemo(() => {
    if (!busRefreshTime) return { nextBus: null, upcomingBuses: [] };

    const currentMinutes = busRefreshTime.getHours() * 60 + busRefreshTime.getMinutes();
    
    // Find next bus for today
    const next = sortedBuses.find(b => getBusMinutes(b.time) >= currentMinutes) || null;
    
    // Find upcoming buses for today (strictly in next 3 hours)
    const nextIndex = next ? sortedBuses.findIndex(b => b.slNo === next.slNo) : -1;
    const upcoming = nextIndex !== -1
      ? sortedBuses
          .slice(nextIndex + 1)
          .filter(b => {
            const bMin = getBusMinutes(b.time);
            return bMin <= currentMinutes + 180;
          })
          .slice(0, 4)
      : [];

    return { nextBus: next, upcomingBuses: upcoming };
  }, [busRefreshTime, sortedBuses]);

  const filteredBuses = useMemo(() => {
    const query = busSearchQuery.toLowerCase().trim();
    if (!query) return sortedBuses;
    return sortedBuses.filter(
      b => 
        b.from.toLowerCase().includes(query) ||
        b.to.toLowerCase().includes(query) ||
        b.via.toLowerCase().includes(query) ||
        (b.tripsExtendedToMainGate && b.tripsExtendedToMainGate.toLowerCase().includes(query))
    );
  }, [busSearchQuery, sortedBuses]);

  // ----------------------------------------------------
  // Mess Menu Memo
  // ----------------------------------------------------
  const activeDayMenu = useMemo(() => {
    if (!messMenuData || !messMenuData.menu || !messMenuDay) return null;
    return messMenuData.menu[messMenuDay];
  }, [messMenuData, messMenuDay]);

  return (
    <>
      {/* Skip to Content Link */}
      <a href="#main-content" className="skip-to-content sr-only">
        Skip to main content
      </a>

      {/* Dynamic Background Accents */}
      <div className="bg-glow-container" aria-hidden="true">
        <div className="bg-glow-circle-1"></div>
        <div className="bg-glow-circle-2"></div>
      </div>

      <div className="app-container">
        {/* Navigation & Header */}
        <header className="app-header">
          <div className="brand-section">
            <div className="brand-logo-glow">
              <CalendarIcon size={24} />
            </div>
            <div>
              <h1 className="brand-title">Term IV Timetable</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Interactive Calendar Exporter</p>
            </div>
          </div>

          {/* Theme Selector Toggle */}
          <div 
            className="theme-switch" 
            data-theme-value={theme}
            onClick={() => toggleTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            <div className="theme-switch-bg"></div>
            <button 
              className={`theme-switch-btn ${theme === 'light' ? 'active' : ''}`}
              aria-label="Light mode"
              type="button"
            >
              <Sun size={15} />
            </button>
            <button 
              className={`theme-switch-btn ${theme === 'dark' ? 'active' : ''}`}
              aria-label="Dark mode"
              type="button"
            >
              <Moon size={15} />
            </button>
          </div>
        </header>

        {/* Main Tab Switcher */}
        <nav className="tab-navigation" aria-label="Main Dashboard Navigation">
          <button 
            id="tab-timetable"
            className={`tab-nav-item ${currentTab === 'timetable' ? 'active' : ''}`}
            onClick={() => setCurrentTab('timetable')}
            type="button"
          >
            <CalendarIcon size={18} />
            <span className="desktop-tab-label">Timetable</span>
            <span className="mobile-tab-label">Timetable</span>
          </button>
          <button 
            id="tab-bus"
            className={`tab-nav-item ${currentTab === 'bus' ? 'active' : ''}`}
            onClick={() => setCurrentTab('bus')}
            type="button"
          >
            <Bus size={18} />
            <span className="desktop-tab-label">Bus Schedule</span>
            <span className="mobile-tab-label">Bus</span>
          </button>
          <button 
            id="tab-mess"
            className={`tab-nav-item ${currentTab === 'mess' ? 'active' : ''}`}
            onClick={() => setCurrentTab('mess')}
            type="button"
          >
            <Utensils size={18} />
            <span className="desktop-tab-label">Mess Menu</span>
            <span className="mobile-tab-label">Menu</span>
          </button>
        </nav>

        {/* Timetable Tab Content */}
        {currentTab === 'timetable' && (
          <>
            {/* Error State */}
            {error && (
              <div className="glass-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)' }}>
                <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Unable to retrieve schedule</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
                <button 
                  className="btn btn-secondary" 
                  style={{ marginTop: '1rem' }} 
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw size={14} /> Retry Connection
                </button>
              </div>
            )}

            <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              {/* Skeleton loader for the preview section when generating but events not loaded yet */}
              {generating && !generatedEvents && (
                <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} aria-busy="true" aria-live="polite">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                    <div style={{ width: '200px' }} className="skeleton-row">
                      <div className="skeleton-text" style={{ width: '80%', height: '1.25rem' }}></div>
                      <div className="skeleton-text" style={{ width: '60%', height: '0.8rem', marginTop: '0.25rem' }}></div>
                    </div>
                    <div style={{ width: '120px', height: '2.5rem', borderRadius: 'var(--radius-md)' }} className="skeleton-text"></div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', overflow: 'hidden' }}>
                      <div className="skeleton-text" style={{ width: '100px', height: '1rem', flexShrink: 0 }}></div>
                      <div className="skeleton-text" style={{ width: '120px', height: '1rem', flexShrink: 0 }}></div>
                      <div className="skeleton-text" style={{ width: '120px', height: '1rem', flexShrink: 0 }}></div>
                      <div className="skeleton-text" style={{ width: '120px', height: '1rem', flexShrink: 0 }}></div>
                      <div className="skeleton-text" style={{ width: '120px', height: '1rem', flexShrink: 0 }}></div>
                    </div>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '0.5rem 0', overflow: 'hidden' }}>
                        <div className="skeleton-text" style={{ width: '100px', height: '1.5rem', flexShrink: 0 }}></div>
                        <div className="skeleton-text" style={{ flex: 1, height: '2.5rem', borderRadius: '6px', minWidth: '120px' }}></div>
                        <div className="skeleton-text" style={{ width: '80px', height: '1.5rem', flexShrink: 0 }}></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Timetable Preview & Actions Section */}
              {generatedEvents && (
                <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Generated Timetable Preview
                      </h2>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        Found {generatedEvents.length} class slots in the database
                      </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Sync Calendar Button */}
                      <button
                        className="btn btn-primary"
                        onClick={() => setIsExportModalOpen(true)}
                        type="button"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        <RefreshCw size={14} /> Sync Calendar
                      </button>

                      {/* Preview Tab Control */}
                      <div className="preview-tabs" style={{ marginBottom: 0 }}>
                        <button 
                          className={`preview-tab-btn ${previewTab === 'list' ? 'active' : ''}`}
                          onClick={() => setPreviewTab('list')}
                          type="button"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <List size={15} /> List View
                        </button>
                        <button 
                          className={`preview-tab-btn ${previewTab === 'calendar' ? 'active' : ''}`}
                          onClick={() => setPreviewTab('calendar')}
                          type="button"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <Grid size={15} /> Calendar format
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List / Calendar View Rendering */}
                  {generatedEvents.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'rgba(0,0,0,0.01)', borderRadius: '12px' }}>
                      <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No classes scheduled</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        There are no scheduled lectures in Term IV for the selected courses in the Google Sheet database.
                      </p>
                    </div>
                  ) : previewTab === 'list' ? (
                    /* List View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* List Filter Tabs */}
                      <div className="list-filter-tabs">
                        <button 
                          className={`list-filter-btn ${listFilter === 'today' ? 'active' : ''}`}
                          onClick={() => setListFilter('today')}
                          type="button"
                        >
                          Today
                        </button>
                        <button 
                          className={`list-filter-btn ${listFilter === 'week' ? 'active' : ''}`}
                          onClick={() => setListFilter('week')}
                          type="button"
                        >
                          This Week
                        </button>
                        <button 
                          className={`list-filter-btn ${listFilter === 'full' ? 'active' : ''}`}
                          onClick={() => setListFilter('full')}
                          type="button"
                        >
                          Full Term
                        </button>
                      </div>

                      <div className="timeline-list">
                        {Object.keys(groupedEvents).length === 0 ? (
                          <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(0,0,0,0.01)', borderRadius: '12px' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No classes scheduled for this view</p>
                          </div>
                        ) : (
                          Object.entries(groupedEvents).map(([dateStr, events]) => (
                            <div key={dateStr} className="timeline-group">
                              <h3 className="timeline-date-header">{dateStr}</h3>
                              {events.map((e, index) => (
                                <div key={index} className={`timeline-event-card ${e.isCancelled ? 'cancelled' : ''}`}>
                                  <div className="timeline-event-time">{e.timeSlot}</div>
                                  <div className="timeline-event-info">
                                    <span className="timeline-event-title">{e.summary}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Room: {e.location}
                                    </span>
                                  </div>
                                  <span className={`timeline-event-room ${e.isCancelled ? 'cancelled' : ''}`}>
                                    {e.isCancelled ? 'CANCELLED' : (e.room && e.room.toLowerCase().includes('room') ? e.room : `Room ${e.room}`)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Calendar Format View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Week Navigation Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.25rem 0' }}>
                        <div className="calendar-nav-buttons">
                          <button 
                            className="btn btn-secondary" 
                            onClick={handlePrevWeek} 
                            type="button"
                          >
                            &larr; Prev Week
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            onClick={handleJumpToCurrentWeek} 
                            type="button"
                            style={{ fontWeight: 700 }}
                          >
                            Current Week
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            onClick={handleNextWeek} 
                            type="button"
                          >
                            Next Week &rarr;
                          </button>
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {activeWeekDays[0].date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' - '}
                          {activeWeekDays[6].date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      <div className="calendar-wrapper" ref={calendarWrapperRef}>
                        <div className="calendar-grid" style={{ gridTemplateColumns: '100px repeat(7, minmax(130px, 1fr))', minWidth: '950px' }}>
                          {/* Headers */}
                          <div className="calendar-header-cell">Time Slot</div>
                          {activeWeekDays.map(dayInfo => {
                            const isToday = dayInfo.date.toDateString() === getIstNow().toDateString();
                            return (
                              <div 
                                key={dayInfo.dateStr} 
                                className={`calendar-header-cell ${isToday ? 'today-highlight' : ''}`}
                                style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', alignItems: 'center' }}
                              >
                                <span style={{ fontWeight: 700 }}>{dayInfo.dayName}</span>
                                <span style={{ fontSize: '0.75rem', color: isToday ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                                  {dayInfo.formatted}
                                </span>
                                {isToday && <span className="today-badge">Today</span>}
                              </div>
                            );
                          })}

                          {/* Grid Rows */}
                          {timeSlots.map(slot => (
                            <div key={slot} style={{ display: 'contents' }}>
                              {/* Time Slot Column */}
                              <div className="calendar-time-cell">{slot}</div>
                              
                              {/* Days columns */}
                              {activeWeekDays.map(dayInfo => {
                                const isToday = dayInfo.date.toDateString() === getIstNow().toDateString();
                                const cellEvents = generatedEvents.filter(e => {
                                  // Use isoDate from API when available; fall back to the start timestamp
                                  const eISO = e.isoDate || e.start.split('T')[0];
                                  return eISO === dayInfo.isoDate && e.timeSlot === slot;
                                });

                                return (
                                  <div 
                                    key={dayInfo.dateStr} 
                                    className={`calendar-slot-cell ${isToday ? 'today-column' : ''}`}
                                  >
                                    {cellEvents.map((e, index) => (
                                      <div key={index} className={`calendar-event-pill ${e.isCancelled ? 'cancelled' : ''}`} title={e.summary}>
                                        <span className="calendar-event-abbr">
                                          {e.abbr}{e.section ? `-${e.section}` : ''}
                                        </span>
                                        <span className="calendar-event-room-label">
                                          {e.isCancelled ? 'CANCELLED' : (e.room && e.room.toLowerCase().includes('room') ? e.room : `Room ${e.room}`)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Main Selection Layout */}
              {!error && (
                <div className="main-layout">
                  
                  {/* Left Column: Course Selector Card */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* PDF Document Upload Area */}
                    <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Auto-Select via PDF Import
                      </h2>
                      
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePdfUpload} 
                        accept="application/pdf" 
                        style={{ display: 'none' }}
                      />

                      <div 
                        className="pdf-dropzone" 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ opacity: parsingPdf ? 0.7 : 1, pointerEvents: parsingPdf ? 'none' : 'auto' }}
                        role="button"
                        tabIndex={0}
                        aria-label="Upload EDTEX Confirmed Courses PDF to auto-select courses"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                      >
                        {parsingPdf ? (
                          <>
                            <RefreshCw size={36} className="pdf-dropzone-icon spin" />
                            <span className="pdf-dropzone-text">Parsing Selection PDF...</span>
                            <span className="pdf-dropzone-subtext">Mapping courses and sections...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud size={36} className="pdf-dropzone-icon" />
                            <span className="pdf-dropzone-text">Click to upload your EDTEX Confirmed Courses PDF</span>
                            <span className="pdf-dropzone-subtext">Auto-selects PGP courses and appropriate sections</span>
                          </>
                        )}
                      </div>
                    </section>

                    {/* Grid Selector */}
                    <section className="glass-card courses-container">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Course Selection</h2>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                            Click cards to select, and use section bubbles to assign specific sections.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleSelectAll}>
                            Select All
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={handleClearSelection}>
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Search input with Clear Cross Button */}
                      <div className="search-filter-row">
                        <div className="search-input-wrapper">
                          <Search size={16} className="search-icon" />
                          <input
                            type="text"
                            placeholder="Search by name or abbreviation (e.g., GT, Investment)..."
                            className="search-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          {searchQuery && (
                            <button 
                              className="search-clear-btn" 
                              onClick={() => setSearchQuery('')}
                              title="Clear search"
                              type="button"
                              aria-label="Clear search query"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Course Grid */}
                      {loading ? (
                        <div className="courses-grid" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '200px' }}>
                          <div className="skeleton-row">
                            <div className="skeleton-text" style={{ width: '40%' }}></div>
                            <div className="skeleton-text" style={{ width: '85%' }}></div>
                          </div>
                        </div>
                      ) : filteredCourses.length === 0 ? (
                        <div className="courses-grid" style={{ padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '200px', textAlign: 'center' }}>
                          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No courses match your query</p>
                        </div>
                      ) : (
                        <div className="courses-grid">
                          {filteredCourses.map((course) => {
                            const selectedSection = selectedCourses[course.abbr];
                            const isSelected = selectedSection !== undefined;
                            const hasSections = course.sections && course.sections.length > 0;

                            return (
                              <div 
                                key={course.abbr} 
                                className={`course-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => toggleCourse(course.abbr)}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleCourse(course.abbr);
                                  }
                                }}
                                aria-label={`${course.name} (${course.abbr}). ${isSelected ? 'Selected' : 'Not selected'}. ${course.sections && course.sections.length > 0 ? `Sections available: ${course.sections.join(', ')}` : ''}`}
                              >
                                <input 
                                  type="checkbox" 
                                  className="course-checkbox"
                                  checked={isSelected}
                                  readOnly
                                  tabIndex={-1}
                                  aria-hidden="true"
                                />
                                <div className="course-info" style={{ width: '100%' }}>
                                  <span className="course-abbr">{course.abbr}</span>
                                  <span className="course-name">{course.name}</span>
                                  
                                  {/* Section selector on course card */}
                                  {isSelected && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%', alignItems: 'center', marginTop: '0.5rem' }}>
                                      {/* Section Selector */}
                                      {hasSections ? (
                                        <div className="section-selector-container" style={{ margin: 0, flex: 1 }}>
                                          {course.sections?.map(sec => (
                                            <button
                                              key={sec}
                                              className={`section-selector-bubble ${selectedSection === sec ? 'active' : ''}`}
                                              onClick={(e) => changeCourseSection(course.abbr, sec, e)}
                                              type="button"
                                              title={`Select Section ${sec}`}
                                            >
                                              {sec}
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ flex: 1 }} />
                                      )}
                                      {/* View Schedule Button */}
                                      <button
                                        className="btn btn-secondary"
                                        style={{ 
                                          fontSize: '0.7rem', 
                                          padding: '0.25rem 0.5rem', 
                                          borderRadius: '4px',
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '0.25rem',
                                          marginLeft: 'auto'
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewCourseSchedule(course.abbr, selectedSection);
                                        }}
                                        type="button"
                                        title={`View schedule for ${course.abbr}`}
                                      >
                                        <FileText size={12} /> Schedule
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>

                  {/* Right Column: Sidebar */}
                  <aside className="sidebar-container">
                    <div className="sidebar-sticky">
                      {/* Selected Courses Tags Card */}
                      <div className="glass-card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                          Selected Courses ({selectedCoursesInfo.length})
                        </h3>
                        
                        {selectedCoursesInfo.length === 0 ? (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem 0' }}>
                            No courses selected. Upload your PDF or select manually to begin.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                            {selectedCoursesInfo.map(c => (
                              <div className="selected-course-tag" key={c.abbr}>
                                <div className="selected-course-info">
                                  <span className="selected-course-tag-abbr">
                                    {c.abbr}{c.section ? ` - Sec ${c.section}` : ''}
                                  </span>
                                  <span className="selected-course-tag-name" title={c.name}>{c.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={() => handleViewCourseSchedule(c.abbr, c.section)}
                                    title={`View Schedule for ${c.abbr}`}
                                    type="button"
                                  >
                                    <FileText size={13} />
                                  </button>
                                  <button 
                                    className="selected-course-remove-btn" 
                                    onClick={() => toggleCourse(c.abbr)}
                                    title={`Deselect ${c.abbr}`}
                                    type="button"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Prompt to Generate Timetable */}
                      {selectedCoursesInfo.length > 0 && !generatedEvents && (
                        <div className="prompt-card">
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Ready to Build Timetable?
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0.5rem 0' }}>
                            Compile the schedules for your selected course sections.
                          </p>
                          <button 
                            className="btn btn-primary" 
                            style={{ width: '100%' }}
                            onClick={handleGenerateTimetable}
                            disabled={generating}
                            type="button"
                          >
                            {generating ? (
                              <>
                                <RefreshCw size={14} className="spin" /> Building...
                              </>
                            ) : (
                              'Generate Timetable'
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </aside>

                </div>
              )}
            </main>
          </>
        )}

        {/* Bus Schedule Tab Content */}
        {currentTab === 'bus' && (
          <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <div className="bus-schedule-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Real-time Cards */}
              <div className="bus-realtime-grid">
                
                {/* Next Bus */}
                <div className="glass-card bus-realtime-card next-bus-card" style={{ padding: '1.5rem' }}>
                  <div className="bus-card-header">
                    <Clock className="bus-header-icon" size={18} />
                    <h3>NEXT BUS</h3>
                  </div>
                  {busCalculations.nextBus ? (
                    <div className="bus-card-body">
                      <div className="bus-time-display">{busCalculations.nextBus.time}</div>
                      <div className="bus-route-display">
                        <span className="bus-route-from">{busCalculations.nextBus.from}</span>
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                        <span className="bus-route-to">{busCalculations.nextBus.to}</span>
                      </div>
                      <div className="bus-via-display">Via: {busCalculations.nextBus.via || 'Direct'}</div>
                      {busCalculations.nextBus.tripsExtendedToMainGate && (
                        <div className="bus-badge">Extends to {busCalculations.nextBus.tripsExtendedToMainGate}</div>
                      )}
                    </div>
                  ) : (
                    <div className="bus-card-empty">
                      <AlertTriangle size={32} style={{ color: 'var(--accent-color)' }} />
                      <p style={{ fontWeight: 600 }}>No more buses scheduled for today.</p>
                    </div>
                  )}
                </div>

                {/* Upcoming Buses */}
                <div className="glass-card bus-realtime-card upcoming-buses-card" style={{ padding: '1.5rem' }}>
                  <div className="bus-card-header">
                    <List className="bus-header-icon" size={18} />
                    <h3>UPCOMING BUSES (NEXT 3 HOURS)</h3>
                  </div>
                  <div className="bus-card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {busCalculations.upcomingBuses.length > 0 ? (
                      <div className="upcoming-buses-list">
                        {busCalculations.upcomingBuses.map((bus) => (
                          <div key={bus.slNo} className="upcoming-bus-item">
                            {(() => {
                              const parts = bus.time.split(' ');
                              const timeVal = parts[0];
                              const ampm = parts[1] || '';
                              return (
                                <div className="upcoming-bus-time-wrapper">
                                  <span className="upcoming-bus-time-val">{timeVal}</span>
                                  {ampm && <span className="upcoming-bus-time-ampm">{ampm}</span>}
                                </div>
                              );
                            })()}
                            <div className="upcoming-bus-route">
                              <span style={{ fontWeight: 700 }}>{bus.from} &rarr; {bus.to}</span>
                              <span className="upcoming-bus-via">Via: {bus.via || 'Direct'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bus-card-empty">
                        <p>{busCalculations.nextBus ? 'No additional buses in the next 3 hours.' : 'No upcoming buses for today.'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Sync and Refresh */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Times display in Indian Standard Time (IST). Last Updated: {busRefreshTime ? busRefreshTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                </div>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setBusRefreshTime(getIstNow())}
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  <RefreshCw size={14} /> Refresh Time
                </button>
              </div>

              {/* Full Schedule list */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Full Bus Schedule</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    Complete list of all shuttle routes operating between housing and campuses.
                  </p>
                </div>

                {/* Search query input */}
                <div className="search-filter-row" style={{ marginBottom: '1.5rem' }}>
                  <div className="search-input-wrapper" style={{ maxWidth: '400px' }}>
                    <Search size={16} className="search-icon" />
                    <input
                      id="bus-search"
                      type="text"
                      placeholder="Search routes by from, to, or via..."
                      className="search-input"
                      value={busSearchQuery}
                      onChange={(e) => setBusSearchQuery(e.target.value)}
                    />
                    {busSearchQuery && (
                      <button 
                        className="search-clear-btn" 
                        onClick={() => setBusSearchQuery('')}
                        title="Clear search"
                        type="button"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Desktop and Tablet table */}
                <div className="bus-table-wrapper">
                  <table className="bus-table">
                    <thead>
                      <tr>
                        <th className="desktop-only-cell">Time</th>
                        <th>From</th>
                        <th>To</th>
                        <th className="desktop-only-cell">Via</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuses.map((bus) => {
                        const isNext = busCalculations.nextBus && busCalculations.nextBus.slNo === bus.slNo;
                        return (
                          <tr key={bus.slNo} className={isNext ? 'next-bus-highlight-row' : ''}>
                            {/* Time Column (Desktop Only) */}
                            <td className="desktop-only-cell" style={{ fontWeight: 700 }}>
                              {bus.time}
                              {isNext && <span className="next-bus-tag">NEXT</span>}
                            </td>
                            
                            {/* From Column (All viewports) */}
                            <td>
                              <div className="mobile-time-badge-wrapper">
                                <span className="mobile-time-text">{bus.time}</span>
                                {isNext && <span className="next-bus-tag">NEXT</span>}
                              </div>
                              <span className="from-text">{bus.from}</span>
                            </td>
                            
                            {/* To Column (All viewports) */}
                            <td>
                              <span className="to-text">{bus.to}</span>
                              {bus.via && (
                                <span className="mobile-via-subtext">
                                  via {bus.via}
                                </span>
                              )}
                            </td>
                            
                            {/* Via Column (Desktop Only) */}
                            <td className="desktop-only-cell">{bus.via || '-'}</td>
                          </tr>
                        );
                      })}
                      {filteredBuses.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No buses found matching &quot;{busSearchQuery}&quot;
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </main>
        )}

        {/* Mess Menu Tab Content */}
        {currentTab === 'mess' && (
          <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <div className="mess-menu-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Menu Month & Day Select */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Students Mess Menu
                  </h2>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    Month: <strong style={{ color: 'var(--text-primary)' }}>{messMenuData?.month || 'June 2026'}</strong>
                  </p>
                </div>

                 {/* Dropdown Select Day */}
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} ref={dayDropdownRef}>
                   <span id="day-select-label" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                     Select Day:
                   </span>
                   
                   <div className="custom-dropdown-container">
                     <button
                       id="day-select-trigger"
                       className="custom-dropdown-trigger"
                       onClick={() => setIsDayDropdownOpen(!isDayDropdownOpen)}
                       type="button"
                       aria-haspopup="listbox"
                       aria-expanded={isDayDropdownOpen}
                       aria-labelledby="day-select-label day-select-trigger"
                     >
                       <span>{messMenuDay ? messMenuDay.charAt(0) + messMenuDay.slice(1).toLowerCase() : 'Select Day'}</span>
                       <ChevronDown 
                         size={16} 
                         className="dropdown-chevron-icon"
                         style={{ 
                           transform: isDayDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                           transition: 'transform var(--transition-fast)' 
                         }} 
                       />
                     </button>
                     
                     {isDayDropdownOpen && (
                       <div className="custom-dropdown-menu" role="listbox" aria-labelledby="day-select-label">
                         {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                           <button
                             key={day}
                             className={`custom-dropdown-item ${messMenuDay === day ? 'active' : ''}`}
                             onClick={() => {
                               setMessMenuDay(day);
                               setIsDayDropdownOpen(false);
                             }}
                             role="option"
                             aria-selected={messMenuDay === day}
                             type="button"
                           >
                             {day.charAt(0) + day.slice(1).toLowerCase()}
                           </button>
                         ))}
                       </div>
                     )}
                   </div>
                 </div>
              </div>

              {loadingMessMenu ? (
                <div style={{ padding: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                  <RefreshCw size={36} className="spin" style={{ color: 'var(--primary-color)' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Loading mess menu from database...</p>
                </div>
              ) : messMenuError ? (
                <div className="glass-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)', textAlign: 'center', padding: '3rem 1.5rem' }}>
                  <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Unable to retrieve mess menu</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{messMenuError}</p>
                </div>
              ) : !activeDayMenu ? (
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)' }}>No menu data available for the selected day.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* Quick navigation anchor links */}
                  <div className="mess-quick-nav">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '0.25rem' }}>JUMP TO:</span>
                    <button 
                      onClick={() => document.getElementById('breakfast')?.scrollIntoView({ behavior: 'smooth' })} 
                      className="btn btn-secondary quick-nav-btn"
                      type="button"
                    >
                      Breakfast
                    </button>
                    <button 
                      onClick={() => document.getElementById('lunch')?.scrollIntoView({ behavior: 'smooth' })} 
                      className="btn btn-secondary quick-nav-btn"
                      type="button"
                    >
                      Lunch
                    </button>
                    <button 
                      onClick={() => document.getElementById('dinner')?.scrollIntoView({ behavior: 'smooth' })} 
                      className="btn btn-secondary quick-nav-btn"
                      type="button"
                    >
                      Dinner
                    </button>
                  </div>

                  {/* Meal Sections Grid */}
                  <div className="meal-sections-grid">
                    
                    {/* Breakfast Card */}
                    <section id="breakfast" className="glass-card meal-card">
                      <div className="meal-card-header breakfast-header">
                        <h3>Breakfast Menu</h3>
                        <span className="meal-badge">Morning</span>
                      </div>
                      <div className="meal-items-list">
                        {activeDayMenu.breakfast.map((item: any, idx: number) => (
                          <div key={idx} className={`meal-item-row ${item.isNonVeg ? 'non-veg-item' : 'veg-item'}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span className="meal-item-category">{item.category}</span>
                              <span className="meal-item-name">{item.name}</span>
                            </div>
                            <span className={`veg-badge ${item.isNonVeg ? 'non-veg' : 'veg'}`} aria-label={item.isNonVeg ? 'Non-vegetarian item' : 'Vegetarian item'}>
                              <span className="dot"></span>
                              {item.isNonVeg ? 'Non-Veg' : 'Veg'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Lunch Card */}
                    <section id="lunch" className="glass-card meal-card">
                      <div className="meal-card-header lunch-header">
                        <h3>Lunch Menu</h3>
                        <span className="meal-badge">Noon</span>
                      </div>
                      <div className="meal-items-list">
                        {activeDayMenu.lunch.map((item: any, idx: number) => (
                          <div key={idx} className={`meal-item-row ${item.isNonVeg ? 'non-veg-item' : 'veg-item'}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span className="meal-item-category">{item.category}</span>
                              <span className="meal-item-name">{item.name}</span>
                            </div>
                            <span className={`veg-badge ${item.isNonVeg ? 'non-veg' : 'veg'}`} aria-label={item.isNonVeg ? 'Non-vegetarian item' : 'Vegetarian item'}>
                              <span className="dot"></span>
                              {item.isNonVeg ? 'Non-Veg' : 'Veg'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Dinner Card */}
                    <section id="dinner" className="glass-card meal-card">
                      <div className="meal-card-header dinner-header">
                        <h3>Dinner Menu</h3>
                        <span className="meal-badge">Night</span>
                      </div>
                      <div className="meal-items-list">
                        {activeDayMenu.dinner.map((item: any, idx: number) => (
                          <div key={idx} className={`meal-item-row ${item.isNonVeg ? 'non-veg-item' : 'veg-item'}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span className="meal-item-category">{item.category}</span>
                              <span className="meal-item-name">{item.name}</span>
                            </div>
                            <span className={`veg-badge ${item.isNonVeg ? 'non-veg' : 'veg'}`} aria-label={item.isNonVeg ? 'Non-vegetarian item' : 'Vegetarian item'}>
                              <span className="dot"></span>
                              {item.isNonVeg ? 'Non-Veg' : 'Veg'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                  </div>

                </div>
              )}
            </div>
          </main>
        )}

        {/* Elegant Footer */}
        <footer style={{ marginTop: 'auto', padding: '1.5rem 0', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Term IV Timetable Exporter &copy; {new Date().getFullYear()}
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <a 
              href="https://docs.google.com/spreadsheets/d/13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ/edit?usp=sharing" 
              target="_blank" 
              rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              Open Source Google Sheet
            </a>
          </div>
        </footer>
      </div>

      {/* Sync Calendar Modal */}
      {isExportModalOpen && (
        <div 
          className="modal-overlay" 
          onClick={() => setIsExportModalOpen(false)}
          role="none"
        >
          <div 
            className="modal-card" 
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
          >
            <button 
              className="modal-close-btn" 
              onClick={() => setIsExportModalOpen(false)}
              aria-label="Close modal"
              type="button"
            >
              <X size={20} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 id="export-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Sync & Export Calendar
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Keep your calendar synced or share this selection with your classmates.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* ICS file download */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  1. STATIC CALENDAR EXPORT
                </label>
                <a 
                  href={downloadUrl} 
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}
                >
                  <Download size={16} /> Download .ics Calendar File
                </a>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Downloads a standard calendar file that can be imported manually. Note: this does not sync future schedule updates.
                </span>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />

              {/* Subscription feed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  2. LIVE CALENDAR SUBSCRIPTION FEED URL
                </label>
                <div className="url-box-wrapper">
                  <div className="url-display">{subscriptionUrl}</div>
                  <button 
                    className="btn url-copy-btn" 
                    onClick={handleCopyLink}
                    title="Copy Subscription Link"
                    type="button"
                  >
                    <span className="btn-copy-text" style={{ marginRight: '0.25rem' }}>COPY</span>
                    <Copy size={15} />
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Subscribe to this URL in your calendar client (Google Calendar, Outlook, etc.) to get automated live schedule sync.
                </span>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />

              {/* Shareable Combination Link Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  3. SHAREABLE SELECTION LINK
                </label>
                <div className="share-link-card" style={{ margin: 0 }}>
                  <div className="share-link-header">
                    <Check size={16} style={{ color: 'var(--accent-color)' }} />
                    <span>Share Selected Combination</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Use this link to reload the app with your exact selection and pre-generated timetable.
                  </p>
                  <div className="share-link-wrapper">
                    <div className="share-link-text">{shareableLink}</div>
                    <button 
                      className="share-link-copy-btn"
                      onClick={handleCopyShareableLink}
                      type="button"
                      title="Copy Shareable Link"
                    >
                      <Copy size={13} /> Copy Link
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Course Schedule & Syllabus Modal */}
      {activeCourseScheduleAbbr && (
        <div 
          className="modal-overlay" 
          onClick={() => { setActiveCourseScheduleAbbr(null); setCourseScheduleEvents(null); }}
          role="none"
        >
          <div 
            className="modal-card" 
            onClick={e => e.stopPropagation()} 
            style={{ maxWidth: '750px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
          >
            <button 
              className="modal-close-btn" 
              onClick={() => { setActiveCourseScheduleAbbr(null); setCourseScheduleEvents(null); }}
              aria-label="Close modal"
              type="button"
            >
              <X size={20} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span className="course-abbr" style={{ alignSelf: 'flex-start' }}>{activeCourseScheduleAbbr}</span>
              <h2 id="schedule-modal-title" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeScheduleCourse ? activeScheduleCourse.name : activeCourseScheduleAbbr}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Full Term Course Schedule & Progress Tracking
              </p>
            </div>

            {loadingCourseSchedule ? (
              <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <RefreshCw size={36} className="spin" style={{ color: 'var(--primary-color)' }} />
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Loading syllabus details from database...</p>
              </div>
            ) : !courseScheduleEvents || courseScheduleEvents.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'rgba(0,0,0,0.01)', borderRadius: '12px' }}>
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No classes scheduled</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  No scheduled sessions were found in the database for this course.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Progress Summary Card */}
                <div className="progress-tracker-card">
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Term Progress Tracker
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {courseProgressStats.completed} of {courseProgressStats.total} Classes Completed
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 900, 
                    color: 'var(--primary-color)' 
                  }}>
                    {courseProgressStats.percentage}%
                  </div>
                </div>

                {/* Classes List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                  {(() => {
                    let activeCount = 0;
                    const courseCredits = activeScheduleCourse?.credits ?? 3;
                    const maxFormulaClasses = courseCredits * 8;

                    return courseScheduleEvents.map((e, idx) => {
                      const isCompleted = new Date(e.start) < new Date();
                      let isBuffer = false;
                      if (!e.isCancelled) {
                        activeCount++;
                        if (activeCount > maxFormulaClasses) {
                          isBuffer = true;
                        }
                      }

                      return (
                        <div 
                          key={idx} 
                          className={`timeline-event-card ${e.isCancelled ? 'cancelled' : ''} ${isBuffer ? 'buffer' : ''}`}
                          style={{ 
                            padding: '0.75rem 1rem', 
                            borderLeft: e.isCancelled 
                              ? '4px solid #ef4444' 
                              : isBuffer 
                                ? '4px solid var(--accent-color)' 
                                : isCompleted 
                                  ? '4px solid var(--badge-success-text)' 
                                  : '4px solid var(--checkbox-border)',
                            margin: 0
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ 
                              fontFamily: 'var(--font-mono)', 
                              fontSize: '0.8rem', 
                              fontWeight: 700, 
                              color: 'var(--text-muted)',
                              minWidth: '65px' 
                            }}>
                              Session {idx + 1}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ 
                                fontSize: '0.9rem', 
                                fontWeight: 600, 
                                color: 'var(--text-primary)',
                                textDecoration: e.isCancelled ? 'line-through' : 'none' 
                              }}>
                                {e.dateStr} ({getWeekday(e.dateStr)})
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Time: {e.timeSlot}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {e.isCancelled ? (
                              <span className="timeline-event-room cancelled">CANCELLED</span>
                            ) : (
                              <>
                                {isBuffer && (
                                  <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: 'var(--accent-color)',
                                    background: 'rgba(6, 182, 212, 0.1)',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(6, 182, 212, 0.2)'
                                  }}>
                                    Buffer
                                  </span>
                                )}
                                <span className="timeline-event-room">Room {e.room}</span>
                                {isCompleted ? (
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700, 
                                    color: 'var(--badge-success-text)', 
                                    background: 'var(--badge-success-bg)',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px'
                                  }}>
                                    Done
                                  </span>
                                ) : (
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700, 
                                    color: 'var(--text-muted)', 
                                    background: 'var(--checkbox-bg)',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px'
                                  }}>
                                    Upcoming
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll to Top FAB */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="scroll-to-top-btn"
          aria-label="Scroll to top"
          type="button"
        >
          <ArrowUp size={20} />
        </button>
      )}

      {/* Visual Toast Notification */}
      {toastMessage && (
        <div className="toast-container" aria-live="polite">
          <div className="toast">
            <Check size={16} style={{ color: 'var(--accent-color)' }} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="install-banner">
          <div className="install-banner-content">
            <div className="install-banner-text">
              📱 <strong>Install Timetable Exporter</strong> for instant access and a home screen shortcut!
            </div>
            <div className="install-banner-actions">
              <button 
                onClick={handleInstallClick} 
                className="install-btn"
                type="button"
              >
                {isIos ? 'How to Install' : 'Install'}
              </button>
              <button 
                onClick={handleDismissBanner} 
                className="install-dismiss-btn"
                type="button"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIosGuide && (
        <div className="ios-guide-overlay" onClick={() => setShowIosGuide(false)}>
          <div className="ios-guide-card" onClick={e => e.stopPropagation()}>
            <h3 className="ios-guide-title">Install on iOS</h3>
            <div className="ios-steps">
              <div className="ios-step">
                <span className="ios-step-num">1</span>
                <span className="ios-step-text">
                  Tap the <strong>Share</strong> button in Safari&apos;s toolbar (at the bottom of the screen).
                </span>
              </div>
              <div className="ios-step">
                <span className="ios-step-num">2</span>
                <span className="ios-step-text">
                  Scroll down the share options list and select <strong>Add to Home Screen</strong>.
                </span>
              </div>
              <div className="ios-step">
                <span className="ios-step-num">3</span>
                <span className="ios-step-text">
                  Tap <strong>Add</strong> in the top-right corner to complete the installation.
                </span>
              </div>
            </div>
            <button 
              onClick={() => setShowIosGuide(false)} 
              className="ios-guide-close-btn"
              type="button"
            >
              Close Guide
            </button>
          </div>
        </div>
      )}

      {/* PDF Import Confirmation Alert Modal */}
      {showPdfImportAlert && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowPdfImportAlert(false)}
          role="none"
        >
          <div 
            className="modal-card" 
            onClick={e => e.stopPropagation()} 
            style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem 2rem' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-alert-title"
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '60px', 
              height: '60px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.1)', 
              color: 'var(--primary-color)',
              margin: '0 auto 1.5rem auto'
            }}>
              <Check size={32} />
            </div>

            <h2 id="pdf-alert-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Courses Auto-Selected!
            </h2>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              All subjects from your PDF have been auto-selected. <strong>Please cross-check the selection and remove any non-Term IV subjects manually</strong>.
            </p>

            <button 
              onClick={() => setShowPdfImportAlert(false)} 
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem 1.5rem' }}
              type="button"
            >
              I Understand & Cross-Check
            </button>
          </div>
        </div>
      )}
    </>
  );
}
