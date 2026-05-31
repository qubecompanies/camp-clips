interface SliderProps {
  label?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}

export function Slider({ label, min, max, step, value, display, onChange }: SliderProps) {
  return (
    <div className="slider-row">
      {label && <label className="field-label-inline">{label}</label>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{display}</span>
    </div>
  );
}

interface SwitchProps {
  on: boolean;
  label: string;
  onToggle: () => void;
}

export function Switch({ on, label, onToggle }: SwitchProps) {
  return (
    <div className={'switch' + (on ? ' on' : '')} onClick={onToggle}>
      <span>{label}</span>
      <div className="switch-track" />
    </div>
  );
}
