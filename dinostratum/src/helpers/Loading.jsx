import React from "react";
import "../styles/helperStyles/LoadingSpinner.css";

const Loading = () => {
    return (
        <div className="loading-container">
            <div className="loading-wrapper">
                <div className="loading-circle" />
                <label className="loading-title">Stratum</label>
            </div>
        </div>
    );
}; 

export default Loading; 