import React from "react";
import PropTypes from "prop-types";
import "../styles/helperStyles/Unavailable.css";

const Unavailable = ({ screenSize }) => {
  const safeScreenSize = typeof screenSize === "number" ? screenSize : 0;

  return (
    <div className="unavailableUnavailableContainer">
      <div className="unavailableUnavailableWrapper">
        <div className="unavailableUnavailableContent">
          <img
            className="unavailableUnavailableImage"
            src="./dinostratumlogo.png"
            alt="Dino Stratum Logo"
            onError={(e) => {
              e.target.src = "/fallback-logo.png"; 
            }}
          />
          <div className="unavailableUnavailableTextStack">
            <h1 className="unavailableUnavailableTitle">
              Dino Stratum Unavailable
            </h1>
            <p className="unavailableUnavailableMessage">
              The platform is currently unavailable at this screen size.
            </p>
            <p className="unavailableUnavailableSubMessage">
              Please sign in on a {safeScreenSize < 700 ? "larger" : "smaller"} screen to continue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

Unavailable.propTypes = {
  screenSize: PropTypes.number,
};

Unavailable.defaultProps = {
  screenSize: 0,
};

export default Unavailable;