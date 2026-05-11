import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "../styles/helperStyles/Alert.css";

let __alertRoot = null;
let __alertContainer = null;

function ensureMount() {
  if (__alertRoot && __alertContainer) return;
  const existing = document.getElementById("alert-root");
  __alertContainer = existing || document.createElement("div");
  __alertContainer.id = "alert-root";

  __alertContainer.style.position = "fixed";
  __alertContainer.style.inset = "0";
  __alertContainer.style.zIndex = "2147483647"; 
  __alertContainer.style.pointerEvents = "auto";

  if (!existing) document.body.appendChild(__alertContainer);
  __alertRoot = createRoot(__alertContainer);
}

function unmount() {
  if (__alertRoot && __alertContainer) {
    __alertRoot.unmount();
    __alertContainer.remove();
  }
  __alertRoot = null;
  __alertContainer = null;
}

function Alert({
  visible,
  title = "",
  message = "",
  inputs = [],
  showCancel = false,
  onConfirm,
  onCancel
}) {
  const initialState = inputs.reduce((acc, input) => {
    acc[input.name] =
      input.defaultValue || (input.type === "checkbox" ? false : "");
    return acc;
  }, {});

  const [values, setValues] = useState(initialState);

  useEffect(() => {
    setValues(initialState);
  }, [inputs, visible]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel && onCancel();
      } else if (e.key === "Enter") {
        if (areAllInputsFilled()) onConfirm && onConfirm(inputs.length ? values : undefined);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [values, inputs]);

  if (!visible) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleConfirm = () => {
    onConfirm && onConfirm(inputs.length ? values : undefined);
  };

  const handleCancel = () => {
    onCancel && onCancel();
  };

  const areAllInputsFilled = () => {
    return inputs.every((input) => {
      if (input.type === "checkbox") return true;
      const v = values[input.name];
      return v !== undefined && v !== null && v.toString().trim() !== "";
    });
  };

  const wrapperStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    pointerEvents: "auto"
  };

  return (
    <div style={wrapperStyle}>
      <div className="AlertOverlay">
        <div className="Alert" role="dialog" aria-modal="true">
          <img
            className="AlertImage"
            src="./DinoStratumLogo.png"
            alt="Logo"
          />
          {title && <label className="AlertHeader">{title}</label>}
          <label className="AlertSubHeader">{message}</label>

          {inputs.length > 0 &&
            inputs.map((input) => (
              <label className="AlertInputWrapper" key={input.name}>
                {input.type === "select" ? (
                  <select
                    className="AlertInput input-select"
                    name={input.name}
                    value={values[input.name]}
                    onChange={handleChange}
                    {...(input.attributes || {})}
                  >
                    {input.options &&
                      input.options.map((option, index) => (
                        <option key={index} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    className={`AlertInput input-${
                      input.type || "text"
                    }`}
                    type={input.type || "text"}
                    name={input.name}
                    value={
                      input.type === "checkbox" ? undefined : values[input.name]
                    }
                    checked={
                      input.type === "checkbox" ? values[input.name] : undefined
                    }
                    onChange={handleChange}
                    {...(input.attributes || {})}
                  />
                )}
              </label>
            ))}

          <div className="AlertButtonsFlex">
            <button
              className="AlertButtons"
              style={{ backgroundColor: "#AD6ADD" }}
              onClick={handleConfirm}
            >
              OK
            </button>
            {showCancel && (
              <button
                className="AlertButtons"
                style={{ backgroundColor: "#D8D8D8", color: "#191919" }}
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function showDialog({ title, message, inputs = [], showCancel = false }) {
  return new Promise((resolve) => {
    try {
      window.dispatchEvent(new Event("alertWillShow"));
    } catch {}

    ensureMount();

    const cleanup = () => {
      unmount();
    };

    const handleConfirm = (values) => {
      resolve(values);
      cleanup();
    };

    const handleCancel = () => {
      resolve(null);
      cleanup();
    };

    setTimeout(() => {
      if (!__alertRoot) ensureMount();
      __alertRoot.render(
        <Alert
          visible={true}
          title={title}
          message={message}
          inputs={inputs}
          showCancel={showCancel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );
    }, 0);
  });
}