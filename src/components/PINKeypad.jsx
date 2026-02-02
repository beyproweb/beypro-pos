// src/components/PINKeypad.jsx
import React from "react";
import "./PINKeypad.css";

/**
 * Professional numeric keypad for PIN entry
 * Optimized for touch, gloves, and speed
 */
export default function PINKeypad({ onNumberClick, onClear, onSubmit, disabled = false }) {
  const numbers = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["⌫", "0", "✓"],
  ];

  const handleClick = (value) => {
    if (disabled) return;

    if (value === "⌫") {
      onClear();
    } else if (value === "✓") {
      onSubmit();
    } else {
      onNumberClick(value);
    }
  };

  return (
    <div className="pin-keypad">
      {numbers.map((row, rowIndex) => (
        <div key={rowIndex} className="pin-keypad-row">
          {row.map((value) => (
            <button
              key={value}
              className={`pin-key ${
                value === "✓"
                  ? "pin-key-submit"
                  : value === "⌫"
                    ? "pin-key-clear"
                    : ""
              }`}
              onClick={() => handleClick(value)}
              disabled={disabled}
            >
              {value}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
