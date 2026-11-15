import { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import "../styles/helperStyles/Dropdown.css";

const Dropdown = ({ value, onChange, options, placeholder, className = "", variant = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [zBoost, setZBoost] = useState(false);
    const ref = useRef(null);

    const displayValue = value && value !== placeholder ? value : null;

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setIsOpen(false);
                setZBoost(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleToggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        setZBoost(next);
    };

    const handleSelect = (option) => {
        onChange(option);
        setIsOpen(false);
        setTimeout(() => setZBoost(false), 150);
    };

    return (
        <div className={`dropdown ${variant} ${className} ${zBoost ? "dropdownZBoost" : ""}`} ref={ref}>
            <div
                className={`dropdownHeader ${isOpen ? "dropdownHeaderOpen" : ""} ${displayValue ? "hasValue" : ""}`}
                onClick={handleToggle}
            >
                <div className="dropdownHeaderContent">
                    {placeholder && (
                        <span className={`dropdownPlaceholder ${displayValue ? "dropdownPlaceholderFloat" : ""}`}>
                            {placeholder}
                        </span>
                    )}
                    {displayValue && <span className="dropdownValue">{displayValue}</span>}
                </div>
                <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`dropdownIcon ${isOpen ? "dropdownIconRotated" : ""}`}
                />
            </div>
            {isOpen && (
                <div className="dropdownOptions">
                    {options.map(option => (
                        <div
                            key={option}
                            className={`dropdownOption ${option === value ? "dropdownOptionSelected" : ""}`}
                            onClick={() => handleSelect(option)}
                        >
                            <span>{option}</span>
                            {option === value && (
                                <FontAwesomeIcon icon={faCheck} className="dropdownOptionCheck" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dropdown;