type RotationDebugData = {
  timestamp: string;
  componentName: string;
  inputDate: any;
  inputType: string;
  inputOrigin: string;
  parsedDate: {
    dateString: string;
    isoString: string;
    timezoneOffset: number;
    dayOfWeek: number;
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
  };
  startDate: {
    raw: string;
    dateString: string;
    isoString: string;
  };
  mondayOfWeek: {
    dateString: string;
    isoString: string;
    dayOffset: number;
  };
  calculation: {
    diffTime: number;
    diffDays: number;
    diffWeeks: number;
    moduloStep1: number;
    moduloStep2: number;
    finalWeek: number;
    cycleLength: number;
  };
  browserInfo: {
    userAgent: string;
    timezone: string;
    currentTime: string;
    isDST: boolean;
  };
};

let debugEnabled = false;
let debugLog: RotationDebugData[] = [];

export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const urlParams = new URLSearchParams(window.location.search);
  const urlDebug = urlParams.get('debugRotation') === '1';
  const envDebug = import.meta.env.VITE_DEBUG_ROTATION === 'true';

  return urlDebug || envDebug;
}

export function enableDebug() {
  debugEnabled = true;
  if (typeof window !== 'undefined') {
    (window as any).__rotationDebug = {
      enabled: true,
      logs: debugLog,
      clear: () => { debugLog = []; },
      export: () => JSON.stringify(debugLog, null, 2),
      help: () => {
        console.log(`
🔍 ROTATION DEBUG COMMANDS:
  window.__rotationDebug.logs       - View all debug logs
  window.__rotationDebug.export()   - Export logs as JSON string
  window.__rotationDebug.clear()    - Clear all logs
  window.__rotationDebug.help()     - Show this help
  window.__rotationDebug.showPanel() - Toggle debug panel
        `);
      },
      showPanel: () => {
        const panel = document.getElementById('rotation-debug-panel');
        if (panel) {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
      }
    };
  }
}

export function logRotationCalculation(
  componentName: string,
  inputDate: any,
  inputOrigin: string,
  startDateStr: string,
  settings: { start_date: string; cycle_length_weeks: number },
  calculationSteps: {
    targetDate: Date;
    mondayOfTargetWeek: Date;
    diffTime: number;
    diffDays: number;
    diffWeeks: number;
    rotationWeek: number;
  }
) {
  if (!debugEnabled && !isDebugEnabled()) return;

  const now = new Date();
  const targetDate = calculationSteps.targetDate;

  const januaryOffset = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const currentOffset = now.getTimezoneOffset();
  const isDST = januaryOffset !== currentOffset;

  const debugData: RotationDebugData = {
    timestamp: now.toISOString(),
    componentName,
    inputDate: typeof inputDate === 'string' ? inputDate : inputDate?.toString(),
    inputType: typeof inputDate === 'string' ? 'string' : (inputDate instanceof Date ? 'Date' : typeof inputDate),
    inputOrigin,
    parsedDate: {
      dateString: targetDate.toString(),
      isoString: targetDate.toISOString(),
      timezoneOffset: targetDate.getTimezoneOffset(),
      dayOfWeek: targetDate.getDay(),
      year: targetDate.getFullYear(),
      month: targetDate.getMonth() + 1,
      day: targetDate.getDate(),
      hours: targetDate.getHours(),
      minutes: targetDate.getMinutes(),
    },
    startDate: {
      raw: startDateStr,
      dateString: new Date(startDateStr + 'T12:00:00').toString(),
      isoString: new Date(startDateStr + 'T12:00:00').toISOString(),
    },
    mondayOfWeek: {
      dateString: calculationSteps.mondayOfTargetWeek.toString(),
      isoString: calculationSteps.mondayOfTargetWeek.toISOString(),
      dayOffset: targetDate.getDay() === 0 ? -6 : 1 - targetDate.getDay(),
    },
    calculation: {
      diffTime: calculationSteps.diffTime,
      diffDays: calculationSteps.diffDays,
      diffWeeks: calculationSteps.diffWeeks,
      moduloStep1: calculationSteps.diffWeeks % settings.cycle_length_weeks,
      moduloStep2: ((calculationSteps.diffWeeks % settings.cycle_length_weeks) + settings.cycle_length_weeks) % settings.cycle_length_weeks,
      finalWeek: calculationSteps.rotationWeek,
      cycleLength: settings.cycle_length_weeks,
    },
    browserInfo: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTime: now.toString(),
      isDST,
    },
  };

  debugLog.push(debugData);

  console.group(`🔄 ROTATION WEEK CALCULATION - ${componentName}`);
  console.log('📥 INPUT:', {
    value: debugData.inputDate,
    type: debugData.inputType,
    origin: debugData.inputOrigin,
  });
  console.log('🌍 BROWSER:', debugData.browserInfo);
  console.log('📅 PARSED DATE:', debugData.parsedDate);
  console.log('🏁 START DATE:', debugData.startDate);
  console.log('📍 MONDAY OF WEEK:', debugData.mondayOfWeek);
  console.log('🧮 CALCULATION:', debugData.calculation);
  console.log('✅ RESULT: Week', debugData.calculation.finalWeek, 'of', debugData.calculation.cycleLength);
  console.groupEnd();

  updateDebugPanel();
}

function updateDebugPanel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let panel = document.getElementById('rotation-debug-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'rotation-debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 400px;
      max-height: 500px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.95);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 15px;
      border-radius: 8px;
      z-index: 999999;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      border: 2px solid #00ff00;
    `;
    document.body.appendChild(panel);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: transparent;
      border: 1px solid #00ff00;
      color: #00ff00;
      width: 20px;
      height: 20px;
      cursor: pointer;
      border-radius: 3px;
      font-size: 14px;
      line-height: 1;
    `;
    closeBtn.onclick = () => {
      panel!.style.display = 'none';
    };
    panel.appendChild(closeBtn);
  }

  const latest = debugLog[debugLog.length - 1];
  if (!latest) return;

  panel.innerHTML = `
    <button style="position: absolute; top: 5px; right: 5px; background: transparent; border: 1px solid #00ff00; color: #00ff00; width: 20px; height: 20px; cursor: pointer; border-radius: 3px; font-size: 14px; line-height: 1;">✕</button>
    <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #00ff00;">
      <strong style="color: #ffff00;">🔄 ROTATION DEBUG [${debugLog.length}]</strong><br/>
      <small style="color: #888;">${latest.timestamp}</small>
    </div>
    <div style="line-height: 1.6;">
      <div style="color: #ffff00; margin-bottom: 5px;"><strong>${latest.componentName}</strong></div>

      <div style="margin: 8px 0;">
        <strong>INPUT:</strong> ${latest.inputType}<br/>
        <span style="color: #88ccff;">${latest.inputDate}</span><br/>
        <small>Origin: ${latest.inputOrigin}</small>
      </div>

      <div style="margin: 8px 0;">
        <strong>BROWSER:</strong><br/>
        TZ: ${latest.browserInfo.timezone}<br/>
        Offset: ${latest.parsedDate.timezoneOffset} min<br/>
        DST: ${latest.browserInfo.isDST ? 'Yes' : 'No'}
      </div>

      <div style="margin: 8px 0;">
        <strong>PARSED:</strong><br/>
        ${latest.parsedDate.year}-${String(latest.parsedDate.month).padStart(2, '0')}-${String(latest.parsedDate.day).padStart(2, '0')} ${String(latest.parsedDate.hours).padStart(2, '0')}:${String(latest.parsedDate.minutes).padStart(2, '0')}<br/>
        Day: ${latest.parsedDate.dayOfWeek} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][latest.parsedDate.dayOfWeek]})
      </div>

      <div style="margin: 8px 0;">
        <strong>MONDAY:</strong><br/>
        ${latest.mondayOfWeek.isoString}<br/>
        Offset: ${latest.mondayOfWeek.dayOffset} days
      </div>

      <div style="margin: 8px 0; padding: 8px; background: rgba(0, 255, 0, 0.1); border: 1px solid #00ff00;">
        <strong style="color: #ffff00;">CALCULATION:</strong><br/>
        Diff Days: ${latest.calculation.diffDays}<br/>
        Diff Weeks: ${latest.calculation.diffWeeks}<br/>
        Cycle: ${latest.calculation.cycleLength} weeks<br/>
        Modulo: ${latest.calculation.diffWeeks} % ${latest.calculation.cycleLength} = ${latest.calculation.moduloStep1}<br/>
        Final: <strong style="color: #ffff00; font-size: 14px;">Week ${latest.calculation.finalWeek}/${latest.calculation.cycleLength}</strong>
      </div>

      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444; font-size: 10px; color: #888;">
        Console: window.__rotationDebug
      </div>
    </div>
  `;

  const newCloseBtn = panel.querySelector('button');
  if (newCloseBtn) {
    (newCloseBtn as HTMLButtonElement).onclick = () => {
      panel!.style.display = 'none';
    };
  }
}

export function getDebugLogs(): RotationDebugData[] {
  return debugLog;
}

export function clearDebugLogs() {
  debugLog = [];
  console.clear();
  console.log('🔄 Rotation debug logs cleared');
}
