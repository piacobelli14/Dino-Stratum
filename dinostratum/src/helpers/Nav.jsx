import { cloneElement, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars, faXmark, faRightToBracket, faIdCard, faRightFromBracket,
  faCode, faSquarePlus, faComputer, faChevronDown, faChevronUp,
  faMountain, faSatellite, faPlantWilt, faSeedling, faRocket,
  faSatelliteDish, faMobileScreen, faEarthAmericas, faMeteor, faStar,
  faCloudMoon, faClipboard, faPlusSquare, faMagnifyingGlass, faList,
  faMapLocation, faWheatAwn, faDatabase, faGauge, faList12,
  faTable, faStarHalfStroke, faEarthOceania, faSun, faHillRockslide,
  faMoon, faBook, faPeopleGroup, faStopwatch, faUserPlus,
  faUserDoctor, faListCheck, faUserGear, faUsersGear, faHeartPulse,
  faHeartbeat, faEye, faMicrophone, faCalendarDays, faWifi,
  faClock, faMicrochip, faPlug, faBatteryFull, faBatteryHalf,
  faBatteryQuarter, faLocationCrosshairs, faCircleNodes, faToolbox, faFolder, faFolderOpen, faCalculator,
  faSquareRootVariable, faTableCells, faChartLine, faScissors, faPalette,
  faCompressArrowsAlt, faBookOpen, faChartBar, faAsterisk, faSuperscript,
  faKey, faShieldHalved, faPlane, faCloudBolt, faDna, faBrain, faFire
} from "@fortawesome/free-solid-svg-icons";
import Tippy from "@tippyjs/react";
import useAuth from "../UseAuth.jsx";
import useIsTouchDevice from "../TouchDevice.jsx";
import "../styles/helperStyles/NavBar.css";
import "tippy.js/dist/tippy.css";

const NavTooltip = ({ children, ...tippyProps }) => {
  const referenceRef = useRef(null);
  return (
    <>
      {cloneElement(children, { ref: referenceRef })}
      <Tippy {...tippyProps} reference={referenceRef} />
    </>
  );
};

const NAV_GROUPS = [
  {
    key: "stratum",
    label: "Stratum",
    icon: faEarthAmericas,
    items: [
      { label: "Risk Command Center", icon: faShieldHalved, path: "/risk-command-center" }
    ]
  },
  {
    key: "account",
    label: "Account",
    icon: faUserGear,
    items: [
      { label: "My Account", icon: faUserGear, path: "/account" },
      { label: "My Team", icon: faUsersGear, path: "/team", adminOnly: true },
    ]
  }
];

const QUICK_LINKS = [
  { label: "Account", icon: faUserGear, path: "/account" },
  { label: "Team", icon: faUsersGear, path: "/team", adminOnly: true },
];

const Nav = ({ activePage }) => {
  const navigate = useNavigate();
  const isTouchDevice = useIsTouchDevice();
  const { token, organizationID, isAdmin, loading } = useAuth();
  const [isHamburger, setIsHamburger] = useState(false);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [openSubDropdown, setOpenSubDropdown] = useState(null);
  const [link, setLink] = useState({ value: "Offline", label: "There is no network connection." });
  const [clock, setClock] = useState({ value: "", label: "" });
  const [memory, setMemory] = useState(null);
  const [battery, setBattery] = useState({
    value: "",
    label: "",
    icon: faPlug
  });

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

  useEffect(() => {
    const describe = () => {
      if (!navigator.onLine) {
        setLink({ value: "Offline", label: "There is no network connection." });
        return;
      }

      const conn = navigator.connection
        || navigator.mozConnection
        || navigator.webkitConnection;

      if (!conn || !conn.downlink) {
        setLink({ value: "Online", label: "Connected. This browser does not report link speed." });
        return;
      }

      const speed = conn.downlink >= 10
        ? `${Math.round(conn.downlink)} Mbps`
        : `${conn.downlink.toFixed(1)} Mbps`;

      const parts = [`The estimated downlink is ${speed}.`];

      if (conn.effectiveType) {
        parts.push(`The effective connection type is ${conn.effectiveType}.`);
      }

      if (conn.rtt) {
        parts.push(`The round trip time is ${conn.rtt} ms.`);
      }

      setLink({ value: speed, label: parts.join(" ") });
    };

    describe();

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    window.addEventListener("online", describe);
    window.addEventListener("offline", describe);

    if (conn && conn.addEventListener) {
      conn.addEventListener("change", describe);
    }

    return () => {
      window.removeEventListener("online", describe);
      window.removeEventListener("offline", describe);

      if (conn && conn.removeEventListener) {
        conn.removeEventListener("change", describe);
      }
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();

      setClock({
        value: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        label: now.toLocaleDateString([], {
          weekday: "long", month: "long", day: "numeric", year: "numeric"
        }) + `. ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`
      });
    };

    tick();

    const timer = setInterval(tick, 15000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.getBattery) {
      setBattery({ value: "", label: "", icon: faPlug });
      return undefined;
    }

    let source = null;

    const describe = (b) => {
      const percent = Math.round(b.level * 100);

      setBattery({
        value: `${percent}%`,
        label: b.charging
          ? `The battery is charging at ${percent} percent.`
          : `The device is on battery with ${percent} percent remaining.`,
        icon: b.charging
          ? faPlug
          : percent > 66
          ? faBatteryFull
          : percent > 33
          ? faBatteryHalf
          : faBatteryQuarter
      });
    };

    navigator.getBattery().then((b) => {
      source = b;
      describe(b);

      b.addEventListener("levelchange", () => describe(b));
      b.addEventListener("chargingchange", () => describe(b));
    }).catch(() => {
      setBattery({ value: "", label: "", icon: faPlug });
    });

    return () => {
      if (source) {
        source.onlevelchange = null;
        source.onchargingchange = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!performance || !performance.memory) {
      return undefined;
    }

    const sample = () => {
      const used = performance.memory.usedJSHeapSize / 1048576;
      const limit = performance.memory.jsHeapSizeLimit / 1048576;

      setMemory({
        value: `${Math.round(used)} MB`,
        label: `This tab is using ${Math.round(used)} MB of a ${Math.round(limit)} MB heap.`
      });
    };

    sample();

    const timer = setInterval(sample, 10000);

    return () => clearInterval(timer);
  }, []);

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

  const hasAdminAccess = isAdmin === true || isAdmin === "admin" || isAdmin === "true" || isAdmin === 1;

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
    setOpenSubDropdown(null);
  };

  const isItemVisible = (item) => !item.adminOnly || hasAdminAccess;

  const isGroupVisible = (group) =>
    (group.items || []).some(isItemVisible)
    || (group.folders || []).some((folder) => folder.items.some(isItemVisible));

  return (
    <>
      <div
        className="homeHeaderContainer"
        style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
      >
        <div className="homeTopNavBarContainer">
          <div className="homeSkipToContent" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <img
              className="homeLogo"
              src="./DinoStratumLogo.png"
              alt="Logo"
            />
            <label className="homeHeader" style={{ color: "#ebf0f8" }}>
              Dino Stratum
            </label>
          </div>

          {(token && organizationID) && (
            <div className="homeStatRow">
              <NavTooltip
                content={link.label}
                theme="tooltip-light"
                placement="bottom"
                delay={[200, 0]}
              >
                <div className="homeStat">
                  <FontAwesomeIcon icon={faWifi} className="homeStatIcon" />
                  <span className="homeStatValue">{link.value}</span>
                </div>
              </NavTooltip>

              <NavTooltip
                content={clock.label}
                theme="tooltip-light"
                placement="bottom"
                delay={[200, 0]}
              >
                <div className="homeStat">
                  <FontAwesomeIcon icon={faClock} className="homeStatIcon" />
                  <span className="homeStatValue">{clock.value}</span>
                </div>
              </NavTooltip>

              {battery.value && (
                <NavTooltip
                  content={battery.label}
                  theme="tooltip-light"
                  placement="bottom"
                  delay={[200, 0]}
                >
                  <div className="homeStat">
                    <FontAwesomeIcon icon={battery.icon} className="homeStatIcon" />
                    <span className="homeStatValue">{battery.value}</span>
                  </div>
                </NavTooltip>
              )}

              {memory && (
                <NavTooltip
                  content={memory.label}
                  theme="tooltip-light"
                  placement="bottom"
                  delay={[200, 0]}
                >
                  <div className="homeStat">
                    <FontAwesomeIcon icon={faMicrochip} className="homeStatIcon" />
                    <span className="homeStatValue">{memory.value}</span>
                  </div>
                </NavTooltip>
              )}
            </div>
          )}

          <div className="homeNavSupplement"></div>

          {(token && organizationID) && (
            <div className="homeQuickRow">
              {QUICK_LINKS
                .filter((link) => !link.adminOnly || hasAdminAccess)
                .map((link) => (
                  <NavTooltip
                    key={link.path}
                    content={link.label}
                    theme="tooltip-light"
                    placement="bottom"
                    delay={[200, 0]}
                  >
                    <button
                      className="homeQuickButton"
                      onClick={() => navigate(link.path)}
                      aria-label={link.label}
                    >
                      <FontAwesomeIcon icon={link.icon} className="homeQuickIcon" />
                    </button>
                  </NavTooltip>
                ))}
            </div>
          )}

          <button
            className="homeHamburgerCircle"
            onClick={() => setIsHamburger(!isHamburger)}
          >
            <FontAwesomeIcon
              icon={isHamburger ? faXmark : faBars}
              className="homeHamburgerIcon"
              style={{ color: "#ebf0f8" }}
            />
          </button>
        </div>
      </div>

      {isHamburger && (
        <div className="homeHamburgerPopout">
          <div className="homeHamburgerContent">

            {(token && organizationID) && NAV_GROUPS
              .filter(isGroupVisible)
              .map((group) => (
              <div key={group.key} className="navigationGroup">
                <button
                  className="navigationButtonWrapper"
                  onClick={() => toggleDropdown(group.key)}
                  style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
                >
                  <div className="navigationButton" style={{ color: "#ebf0f8" }}>
                    <FontAwesomeIcon icon={group.icon} className="navigationButtonIcon" />
                    {group.label}
                  </div>
                  <FontAwesomeIcon
                    icon={openDropdown === group.key ? faChevronUp : faChevronDown}
                    className="navigationButtonIconTrailer"
                  />
                  <div className="navigationButtonDivider" style={{ backgroundColor: "#aab4c8" }} />
                </button>

                {openDropdown === group.key && (group.items || [])
                  .filter(isItemVisible)
                  .map((item) => (
                  <button
                    key={item.path}
                    className="navigationButtonWrapperMini"
                    onClick={() => closeMenuAndNavigate(item.path)}
                    style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
                  >
                    <div className="navigationButton navigationButtonNested" style={{ color: "#ebf0f8" }}>
                      <FontAwesomeIcon icon={item.icon} className="navigationButtonIcon" />
                      {item.label}
                    </div>
                    <div className="navigationButtonDivider" style={{ backgroundColor: "#aab4c8" }} />
                  </button>
                ))}

                {openDropdown === group.key && (group.folders || [])
                  .filter((folder) => folder.items.some(isItemVisible))
                  .map((folder) => (
                  <div key={folder.key} className="navigationSubGroup">
                    <button
                      className="navigationButtonWrapperMini"
                      onClick={() => toggleSubDropdown(folder.key)}
                      style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
                    >
                      <div className="navigationButton navigationButtonNested" style={{ color: "#ebf0f8" }}>
                        <FontAwesomeIcon
                          icon={openSubDropdown === folder.key ? faFolderOpen : faFolder}
                          className="navigationButtonIcon"
                        />
                        {folder.label}
                      </div>
                      <FontAwesomeIcon
                        icon={openSubDropdown === folder.key ? faChevronUp : faChevronDown}
                        className="navigationButtonIconTrailer"
                      />
                      <div className="navigationButtonDivider" style={{ backgroundColor: "#aab4c8" }} />
                    </button>

                    {openSubDropdown === folder.key && folder.items
                      .filter(isItemVisible)
                      .map((item) => (
                      <button
                        key={item.path}
                        className="navigationButtonWrapperMini"
                        onClick={() => closeMenuAndNavigate(item.path)}
                        style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
                      >
                        <div className="navigationButton navigationButtonNested navigationButtonNestedDeep" style={{ color: "#ebf0f8" }}>
                          <FontAwesomeIcon icon={item.icon} className="navigationButtonIcon" />
                          {item.label}
                        </div>
                        <div className="navigationButtonDivider" style={{ backgroundColor: "#aab4c8" }} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            {!token && (
              <button
                className="navigationButtonWrapper"
                onClick={() => navigate("/register")}
                style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
              >
                <div className="navigationButton" style={{ color: "#ebf0f8" }}>
                  <FontAwesomeIcon icon={faIdCard} className="navigationButtonIcon" />
                  Sign Up
                </div>
                <div
                  className="navigationButtonDivider"
                  style={{ backgroundColor: "#aab4c8" }}
                />
              </button>
            )}

            {!token ? (
              <button
                className="navigationButtonWrapper"
                onClick={() => navigate("/login")}
                style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
              >
                <div className="navigationButton" style={{ color: "#ebf0f8" }}>
                  <FontAwesomeIcon
                    icon={faRightToBracket}
                    className="navigationButtonIcon"
                  />
                  Login
                </div>
                <div
                  className="navigationButtonDivider"
                  style={{ backgroundColor: "#aab4c8" }}
                />
              </button>
            ) : (
              <button
                className="navigationButtonWrapper"
                onClick={handleLogout}
                style={{ background: "linear-gradient(135deg, #0a0c10 0%, #11141a 50%, #1b212b 100%)" }}
              >
                <div className="navigationButton" style={{ color: "#ebf0f8" }}>
                  <FontAwesomeIcon
                    icon={faRightFromBracket}
                    className="navigationButtonIcon"
                  />
                  Sign Out
                </div>
                <div
                  className="navigationButtonDivider"
                  style={{ backgroundColor: "#aab4c8" }}
                />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;