import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faXmark,
  faRightToBracket,
  faIdCard,
  faRightFromBracket,
  faCode,
  faSquarePlus,
  faComputer,
  faChevronDown,
  faChevronUp,
  faMountain,
  faSatellite,
  faPlantWilt,
  faSeedling,
  faRocket,
  faSatelliteDish,
  faMobileScreen,
  faEarthAmericas,
  faMeteor,
  faStar,
  faCloudMoon,
  faClipboard,
  faPlusSquare,
  faMagnifyingGlass,
  faList,
  faMapLocation,
  faWheatAwn,
  faDatabase,
  faGauge,
  faList12,
  faTable,
  faStarHalfStroke,
  faEarthOceania,
  faSun,
  faHillRockslide,
  faMoon,
  faBook,
  faPeopleGroup,
  faStopwatch,
  faUserPlus,
  faUserDoctor,
  faListCheck,
  faUser,
  faUsers,
  faMapLocationDot,
  faUserGear,
  faHouse
} from "@fortawesome/free-solid-svg-icons";
import "../styles/helperStyles/NavBar.css";
import useAuth from "../UseAuth.jsx";
import useIsTouchDevice from "../TouchDevice.jsx";

const Nav = ({ activePage }) => {
  const navigate = useNavigate();
  const isTouchDevice = useIsTouchDevice();
  const { token, organizationID, isAdmin, loading } = useAuth();
  const [isHamburger, setIsHamburger] = useState(false);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openSubDropdown, setOpenSubDropdown] = useState(null);

  useEffect(() => {
    const checkTokenExpiration = () => {
      if (token) {
        const decodedToken = decodeToken(token);
        if (decodedToken.exp * 1000 < Date.now()) {
          setIsTokenExpired(true);
        } else {
          setIsTokenExpired(false);
        }
      }
    };

    checkTokenExpiration();
  }, [token]);

  useEffect(() => {
    if (isHamburger) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isHamburger]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userid");
    localStorage.removeItem("orgid");
    navigate("/login");
  };

  const decodeToken = (token) => {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      return {};
    }
  };

  const toggleDropdown = (key) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  const toggleSubDropdown = (key) => {
    setOpenSubDropdown((prev) => (prev === key ? null : key));
  };

  const closeMenuAndNavigate = (path) => {
    navigate(path);
    setIsHamburger(false);
    setOpenDropdown(null);
  };

  return (
    <>
      <div className="homeHeaderContainer">
        <div className="homeTopNavBarContainer">
          <div className="homeSkipToContent">
            <img
              className="homeLogo"
              src="./DinoStratumLogo.png"
              alt="Logo"
            />
            <label className="homeHeader">
              Dino Stratum
            </label>
          </div>

          <div className="homeNavSupplement"></div>

          {!isTouchDevice && (
            <button
              className="homeHamburgerCircle"
              onClick={() => setIsHamburger(!isHamburger)}
            >
              <FontAwesomeIcon
                icon={isHamburger ? faXmark : faBars}
                className="homeHamburgerIcon"
              />
            </button>
          )}
        </div>
      </div>

      {isHamburger && !isTouchDevice && (
        <div className="homeHamburgerPopout">
          <div className="homeHamburgerContent">

            {(token) && (
              <button
                className="navigationButtonWrapper"
                onClick={() => {navigate("/risk-command-center")}}
              >
                <div className="navigationButton">
                  <FontAwesomeIcon
                    icon={faMapLocationDot}
                    className="navigationButtonIcon"
                  />
                  Risk Command center
                </div>
              </button>
            )}

            {(token) && (
              <button
                className="navigationButtonWrapper"
                onClick={() => {navigate("/asset-management")}}
              >
                <div className="navigationButton">
                  <FontAwesomeIcon
                    icon={faHouse}
                    className="navigationButtonIcon"
                  />
                  Asset Manager
                </div>
              </button>
            )}
            
            {(token) && (
              <button
                className="navigationButtonWrapper"
                onClick={() => {navigate("/account")}}
              >
                <div className="navigationButton">
                  <FontAwesomeIcon
                    icon={faUserGear}
                    className="navigationButtonIcon"
                  />
                  My Account
                </div>
              </button>
            )}

            {!token ? (
              <button
                className="navigationButtonWrapper"
                onClick={() => navigate("/login")}
              >
                <div className="navigationButton">
                  <FontAwesomeIcon
                    icon={faRightToBracket}
                    className="navigationButtonIcon"
                  />
                  Login
                </div>
              </button>
            ) : (
              <button
                className="navigationButtonWrapper"
                onClick={handleLogout}
              >
                <div className="navigationButton">
                  <FontAwesomeIcon
                    icon={faRightFromBracket}
                    className="navigationButtonIcon"
                  />
                  Sign Out
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;