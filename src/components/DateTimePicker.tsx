import { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateTimePickerProps {
  value: string | null | undefined;
  onChange: (newValue: string) => void;
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parsear el valor actual
  const dateObj = value ? new Date(value) : null;
  const isValidDate = dateObj && !isNaN(dateObj.getTime());

  // Estados del calendario
  const [currentYear, setCurrentYear] = useState(isValidDate ? dateObj.getFullYear() : new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(isValidDate ? dateObj.getMonth() : new Date().getMonth());

  // Formato para mostrar en el input de texto (siempre DD/MM/YYYY HH:mm)
  const getDisplayText = () => {
    if (!isValidDate) return '';
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Cerrar el datepicker si se hace clic fuera del contenedor
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const daysOfWeek = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  // Funciones de cálculo para el calendario
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const prevMonthDays = getDaysInMonth(currentYear, currentMonth - 1);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const baseDate = isValidDate ? new Date(dateObj.getTime()) : new Date();
    baseDate.setFullYear(currentYear);
    baseDate.setMonth(currentMonth);
    baseDate.setDate(day);
    if (!isValidDate) {
      baseDate.setHours(12);
      baseDate.setMinutes(0);
      baseDate.setSeconds(0);
      baseDate.setMilliseconds(0);
    }
    onChange(baseDate.toISOString());
  };

  const handleTimeChange = (type: 'hours' | 'minutes', val: number) => {
    const baseDate = isValidDate ? new Date(dateObj.getTime()) : new Date();
    if (type === 'hours') {
      baseDate.setHours(val);
    } else {
      baseDate.setMinutes(val);
    }
    onChange(baseDate.toISOString());
  };

  // Celdas del grid del calendario (6 filas de 7 días = 42 celdas)
  const cells: { day: number; isCurrentMonth: boolean }[] = [];
  
  // Días del mes anterior para rellenar la primera semana
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, isCurrentMonth: false });
  }

  // Días del mes actual
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, isCurrentMonth: true });
  }

  // Días del mes siguiente para rellenar la cuadrícula
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, isCurrentMonth: false });
  }

  const selectedDay = isValidDate && dateObj.getFullYear() === currentYear && dateObj.getMonth() === currentMonth ? dateObj.getDate() : null;
  const currentHour = isValidDate ? dateObj.getHours() : 12;
  const currentMinute = isValidDate ? dateObj.getMinutes() : 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between p-3 bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 outline-none transition-all cursor-pointer"
      >
        <input
          type="text"
          readOnly
          placeholder="Seleccionar fecha y hora (DD/MM/YYYY HH:mm)..."
          value={getDisplayText()}
          className="bg-transparent border-none outline-none text-sm text-gray-800 w-full cursor-pointer placeholder-gray-400"
        />
        <CalendarIcon className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-[280px] select-none text-xs font-sans left-0 md:left-auto md:right-0 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Barra de título con cruz de cierre */}
          <div className="flex justify-between items-center pb-2 mb-3 border-b border-gray-100">
            <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Configurar Fecha/Hora</span>
            <button 
              type="button" 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <button 
              type="button" 
              onClick={handlePrevMonth}
              className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-gray-800 text-sm">
              {months[currentMonth]} {currentYear}
            </span>
            <button 
              type="button" 
              onClick={handleNextMonth}
              className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-gray-400 mb-1">
            {daysOfWeek.map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Cuadrícula de días */}
          <div className="grid grid-cols-7 gap-1 mb-4 text-center">
            {cells.map((cell, idx) => {
              const isSelected = cell.isCurrentMonth && cell.day === selectedDay;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => cell.isCurrentMonth && handleSelectDay(cell.day)}
                  className={`
                    py-1 rounded transition-all text-xs font-semibold
                    ${!cell.isCurrentMonth ? 'text-gray-300 cursor-default' : 'text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer'}
                    ${isSelected ? 'bg-brand-600 text-white shadow-xs font-bold' : ''}
                  `}
                  disabled={!cell.isCurrentMonth}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Hora y Minutos en 24 Horas */}
          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <span className="font-bold text-gray-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              Hora (24h)
            </span>
            <div className="flex items-center gap-1">
              <select
                value={currentHour}
                onChange={e => handleTimeChange('hours', Number(e.target.value))}
                className="p-1 border border-gray-200 rounded text-xs bg-white text-gray-800 outline-none font-semibold cursor-pointer"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
              <span className="font-bold text-gray-400">:</span>
              <select
                value={currentMinute}
                onChange={e => handleTimeChange('minutes', Number(e.target.value))}
                className="p-1 border border-gray-200 rounded text-xs bg-white text-gray-800 outline-none font-semibold cursor-pointer"
              >
                {Array.from({ length: 60 }).map((_, m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
