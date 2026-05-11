import React, { useState, useRef, useEffect } from "react";
import "../styles/helperStyles/ColorPicker.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDroplet, faPalette } from "@fortawesome/free-solid-svg-icons";

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0, a: 1 };
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
        a: result[4] ? parseInt(result[4], 16) / 255 : 1
    };
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) { h = 0; }
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h, s: s * 100, v: v * 100 };
}

function hsvToRgb(h, s, b) {
    s /= 100; b /= 100;
    let c = b * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = b - c;
    let r, g, bVal;
    if (h >= 0 && h < 60) { r = c; g = x; bVal = 0; }
    else if (h < 120) { r = x; g = c; bVal = 0; }
    else if (h < 180) { r = 0; g = c; bVal = x; }
    else if (h < 240) { r = 0; g = x; bVal = c; }
    else if (h < 300) { r = x; g = 0; bVal = c; }
    else { r = c; g = 0; bVal = x; }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((bVal + m) * 255)
    };
}

function hsbToHsv(h, s, b, a) {
    return { h, s, v: b, a };
}

function hsvToHex({ h, s, v, a }) {
    const { r, g, b } = hsvToRgb(h, s, v);
    if (a === 1) {
        return (
            "#" +
            [r, g, b]
                .map((x) => x.toString(16).padStart(2, "0"))
                .join("")
        );
    } else {
        const alpha = Math.round(a * 255)
            .toString(16)
            .padStart(2, "0");
        return (
            "#" +
            [r, g, b]
                .map((x) => x.toString(16).padStart(2, "0"))
                .join("") + alpha
        );
    }
}

function hsvToRgba({ h, s, v, a }) {
    const { r, g, b } = hsvToRgb(h, s, v);
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function hsvToHsl({ h, s, v, a }) {
    s /= 100; v /= 100;
    let l = v * (1 - s / 2);
    let newS = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    return `hsla(${h.toFixed(0)}, ${(newS * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a.toFixed(2)})`;
}

function hsvToHsb({ h, s, v, a }) {
    return `hsb(${h.toFixed(0)}, ${s.toFixed(0)}%, ${v.toFixed(0)}%, ${a.toFixed(2)})`;
}

function DinoLabsColorPicker({ color, onChange }) {
    const [hsv, setHsv] = useState({ h: 0, s: 0, v: 0, a: 1 });
    const [selectedFormat, setSelectedFormat] = useState("hex");
    const [inputValue, setInputValue] = useState("");
    const [alphaInputValue, setAlphaInputValue] = useState("");
    const squareRef = useRef(null);
    const hueRef = useRef(null);
    const alphaRef = useRef(null);

    useEffect(() => {
        const initializeColor = (color) => {
            if (!color) return;
            let initialHsv = { h: 0, s: 0, v: 0, a: 1 };
            if (color.startsWith("#")) {
                const rgb = hexToRgb(color);
                initialHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                initialHsv.a = rgb.a;
            } else if (color.startsWith("rgba") || color.startsWith("rgb")) {
                const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const [, r, g, b, a = "1"] = match;
                    initialHsv = rgbToHsv(parseInt(r), parseInt(g), parseInt(b));
                    initialHsv.a = parseFloat(a);
                }
            } else if (color.startsWith("hsla") || color.startsWith("hsl")) {
                const match = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const [, h, s, l, a = "1"] = match;
                    const sDecimal = parseInt(s) / 100;
                    const lDecimal = parseInt(l) / 100;
                    const v = lDecimal + sDecimal * Math.min(lDecimal, 1 - lDecimal);
                    const s2 = v === 0 ? 0 : 2 * (1 - lDecimal / v);
                    initialHsv = { h: parseInt(h), s: s2 * 100, v: v * 100, a: parseFloat(a) };
                }
            } else if (color.startsWith("hsb")) {
                const match = color.match(/hsb\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const [, h, s, b, a = "1"] = match;
                    initialHsv = hsbToHsv(parseInt(h), parseInt(s), parseInt(b), parseFloat(a));
                }
            }
            setHsv(initialHsv);
        };
        initializeColor(color);
    }, [color]);

    useEffect(() => {
        setInputValue(computeColorOutput(hsv));
        if (selectedFormat === "hex") {
            setAlphaInputValue(`${(hsv.a * 100).toFixed(0)}%`);
        }
    }, [hsv, selectedFormat]);

    const parseColorInput = (value) => {
        let newHsv = null;
        if (selectedFormat === "hex") {
            const rgb = hexToRgb(value);
            if (/^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value)) {
                newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                newHsv.a = rgb.a;
            }
        } else if (selectedFormat === "rgba") {
            const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                const [, r, g, b, a = "1"] = match;
                newHsv = rgbToHsv(parseInt(r), parseInt(g), parseInt(b));
                newHsv.a = parseFloat(a);
            }
        } else if (selectedFormat === "hsl") {
            const match = value.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/);
            if (match) {
                const [, h, s, l, a = "1"] = match;
                const sDecimal = parseInt(s) / 100;
                const lDecimal = parseInt(l) / 100;
                const v = lDecimal + sDecimal * Math.min(lDecimal, 1 - lDecimal);
                const s2 = v === 0 ? 0 : 2 * (1 - lDecimal / v);
                newHsv = { h: parseInt(h), s: s2 * 100, v: v * 100, a: parseFloat(a) };
            }
        } else if (selectedFormat === "hsb") {
            const match = value.match(/hsb\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/);
            if (match) {
                const [, h, s, b, a = "1"] = match;
                newHsv = hsbToHsv(parseInt(h), parseInt(s), parseInt(b), parseFloat(a));
            }
        }
        return newHsv;
    };

    const handleInputChange = (value) => {
        setInputValue(value);
        const newHsv = parseColorInput(value);
        if (newHsv) {
            updateColor(newHsv);
        }
    };

    const handleAlphaInputChange = (value) => {
        setAlphaInputValue(value);
        let val = parseFloat(value);
        if (!isNaN(val)) {
            val = Math.max(0, Math.min(val, 100));
            updateColor({ ...hsv, a: val / 100 });
        }
    };

    const updateColor = (newHsv) => {
        const validHsv = {
            h: Math.max(0, Math.min(360, newHsv.h)),
            s: Math.max(0, Math.min(100, newHsv.s)),
            v: Math.max(0, Math.min(100, newHsv.v)),
            a: Math.max(0, Math.min(1, newHsv.a))
        };
        setHsv(validHsv);
        if (onChange) {
            const colorString = computeColorOutput(validHsv);
            onChange(colorString);
        }
    };

    const computeColorOutput = (hsvVal) => {
        switch (selectedFormat) {
            case "hex": return hsvToHex(hsvVal);
            case "rgba": return hsvToRgba(hsvVal);
            case "hsl": return hsvToHsl(hsvVal);
            case "hsb": return hsvToHsb(hsvVal);
            default: return hsvToHex(hsvVal);
        }
    };

    const handleSquareChange = (clientX, clientY) => {
        const rect = squareRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
        const s = (x / rect.width) * 100;
        const v = 100 - (y / rect.height) * 100;
        updateColor({ ...hsv, s, v });
    };

    const handleHueChange = (clientX) => {
        const rect = hueRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const h = (x / rect.width) * 360;
        updateColor({ ...hsv, h });
    };

    const handleAlphaChange = (clientX) => {
        const rect = alphaRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const a = x / rect.width;
        updateColor({ ...hsv, a });
    };

    const startSquareDrag = (e) => {
        e.preventDefault();
        handleSquareChange(e.clientX, e.clientY);
        const onMove = (ev) => {
            ev.preventDefault();
            handleSquareChange(ev.clientX, ev.clientY);
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const startHueDrag = (e) => {
        e.preventDefault();
        handleHueChange(e.clientX);
        const onMove = (ev) => {
            ev.preventDefault();
            handleHueChange(ev.clientX);
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const startAlphaDrag = (e) => {
        e.preventDefault();
        handleAlphaChange(e.clientX);
        const onMove = (ev) => {
            ev.preventDefault();
            handleAlphaChange(ev.clientX);
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);

    return (
        <div className="dinolabsColorPickerBackground">
            <div
                className="dinolabsColorPickerSaturationSquare"
                ref={squareRef}
                style={{
                    background: `linear-gradient(to right, white, hsl(${hsv.h}, 100%, 50%))`
                }}
                onMouseDown={startSquareDrag}
            >
                <div
                    className="dinolabsColorPickerSaturationSquareGradient"
                    style={{
                        background: "linear-gradient(to top, black, transparent)",
                        pointerEvents: "none"
                    }}
                />
                <div
                    className="dinolabsSaturationSquareCursor"
                    style={{
                        left: `${hsv.s}%`,
                        top: `${100 - hsv.v}%`,
                        background: hsvToHex({ ...hsv, a: 1 })
                    }}
                />
            </div>

            <div className="dinolabsColorSliderWrapper">
                <div className="dinolabsColorSliderWrapperStack">
                    <div
                        className="dinolabsHueSlider"
                        ref={hueRef}
                        style={{
                            background: "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)"
                        }}
                        onMouseDown={startHueDrag}
                    >
                        <div
                            className="dinolabsHueSliderCursor"
                            style={{
                                left: `${(hsv.h / 360) * 100}%`
                            }}
                        />
                    </div>

                    <div
                        className="dinolabsHueSlider"
                        ref={alphaRef}
                        style={{
                            background: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1))`
                        }}
                        onMouseDown={startAlphaDrag}
                    >
                        <div
                            className="dinolabsHueSliderCursor"
                            style={{
                                left: `${hsv.a * 100}%`
                            }}
                        />
                    </div>

                    <div className="dinolabsColorFormattingFlex">
                        <div className="dinolabsColorFormatEntryWrapper">
                            <select
                                className="dinolabsColorFormatSelection"
                                id="formatSelect"
                                value={selectedFormat}
                                onChange={(e) => setSelectedFormat(e.target.value)}
                            >
                                <option value="hex">Hex</option>
                                <option value="rgba">RGBA</option>
                                <option value="hsl">HSL</option>
                                <option value="hsb">HSB</option>
                            </select>

                            {selectedFormat !== "hex" ? (
                                <input
                                    className="dinolabsColorInputBig"
                                    value={inputValue}
                                    onChange={(e) => handleInputChange(e.target.value)}
                                />
                            ) : (
                                <input
                                    className="dinolabsColorInput"
                                    value={inputValue}
                                    onChange={(e) => handleInputChange(e.target.value)}
                                />
                            )}

                            {selectedFormat === "hex" && (
                                <input
                                    className="dinolabsAlphaInput"
                                    type="text"
                                    value={alphaInputValue}
                                    onChange={(e) => handleAlphaInputChange(e.target.value)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
}

export default DinoLabsColorPicker;
