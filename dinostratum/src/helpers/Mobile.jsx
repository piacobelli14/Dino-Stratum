import React from "react";
import "../styles/helperStyles/Mobile.css";

const StratumMobile = () => {
  return (
    <div className="stratumUnavailableContainer" style={{justifyContent: "center"}}>
      <div className="stratumUnavailableWrapper">
        <div className="stratumUnavailableContent">
          <img
            className="stratumUnavailableImage"
            src="./DinoStratumLogo.png"
            alt="Stratum Logo"
            onError={(e) => {
              e.target.src = "/fallback-logo.png";
            }}
          />
          <div className="stratumUnavailableTextStack">
            <h1 className="stratumUnavailableTitle">
              Stratum Unavailable
            </h1>
            <p className="stratumUnavailableMessage">
              The platform is currently unavailable on mobile devices.
            </p>
            <p className="stratumUnavailableSubMessage">
              Please sign in on a computer to continue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StratumMobile;