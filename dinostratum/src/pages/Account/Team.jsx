import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlusCircle,
  faMailForward,
  faCaretDown,
  faArrowDownAZ,
  faArrowDownZA,
  faListUl,
  faPlusSquare,
  faCircleInfo,
  faSearch,
  faGlobe
} from "@fortawesome/free-solid-svg-icons";
import "../../styles/mainStyles/Account/Team.css";
import "../../styles/helperStyles/LoadingSpinner.css";
import "../../styles/helperStyles/Disconnected.css";
import Nav from "../../helpers/Nav.jsx";
import { showDialog } from "../../helpers/Alert.jsx";
import useAuth from "../../UseAuth.jsx";
import useIsTouchDevice from "../../TouchDevice.jsx";

const Team = () => {
  const navigate = useNavigate()
  const isTouchDevice = useIsTouchDevice();
  const { token, userID, loading, organizationID } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [screenSize, setScreenSize] = useState(window.innerWidth);
  const [resizeTrigger, setResizeTrigger] = useState(false);
  const [teamPage, setTeamPage] = useState("manage");
  const [teamInvites, setTeamInvites] = useState([{ email: "", first_name: "", last_name: "" }]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const [isLoadingAccessRequests, setIsLoadingAccessRequests] = useState(false);
  const [openPermissionDropdown, setOpenPermissionDropdown] = useState(null);
  const rowPermSelectRef = useRef(null);
  const rowPermDropdownRef = useRef(null);
  const [rowPermDropdownPosition, setRowPermDropdownPosition] = useState({ top: 0, left: 0 });
  const [searchText, setSearchText] = useState("");
  const [backendError, setBackendError] = useState(false);

  useEffect(() => {
    if (!loading && !token) navigate("/login");
  }, [token, loading, navigate]);

  useEffect(() => {
    if (!loading && token && userID && organizationID) {
      fetchTeamMembers();
    }
    setIsLoaded(true);
  }, [userID, loading, token, organizationID]);

  useEffect(() => {
    if (teamPage === "requests" && !loading && token && userID && organizationID) {
      fetchAccessRequests();
    }
  }, [teamPage, userID, loading, token, organizationID]);

  useEffect(() => {
    const handleResize = () => {
      setIsLoaded(false);
      setScreenSize(window.innerWidth);
      setResizeTrigger((prev) => !prev);
      setTimeout(() => setIsLoaded(true), 300);
    };
    if (!isTouchDevice) {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  useEffect(() => {
    if (openPermissionDropdown && rowPermSelectRef.current && rowPermDropdownRef.current) {
      const buttonRect = rowPermSelectRef.current.getBoundingClientRect();
      const dropdownRect = rowPermDropdownRef.current.getBoundingClientRect();
      let newTop = buttonRect.bottom + 5;
      let newLeft = buttonRect.right - dropdownRect.width;
      if (newTop + dropdownRect.height > window.innerHeight) {
        newTop = window.innerHeight - dropdownRect.height;
      }
      if (newLeft < 0) {
        newLeft = 0;
      }
      setRowPermDropdownPosition({ top: newTop, left: newLeft });
    }
  }, [openPermissionDropdown]);

  const fetchTeamMembers = async () => {
    setIsLoadingTeamMembers(true);
    setBackendError(false);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/team-members`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ userID, organizationID })
      });
      const data = await response.json();
      const members = Array.isArray(data.teamMemberInfo) ? data.teamMemberInfo : [];
      setTeamMembers(members);
    } catch (error) {
      if (error instanceof TypeError) {
        setBackendError(true);
      }
      setTeamMembers([]);
    } finally {
      setIsLoadingTeamMembers(false);
    }
  };

  const fetchAccessRequests = async () => {
    setIsLoadingAccessRequests(true);
    setBackendError(false);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/team-members-access-requests`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ userID, organizationID })
      });
      const data = await response.json();
      const requests = Array.isArray(data.accessRequestsInfo) ? data.accessRequestsInfo : [];
      setAccessRequests(requests);
    } catch (error) {
      if (error instanceof TypeError) {
        setBackendError(true);
      }
      setAccessRequests([]);
    } finally {
      setIsLoadingAccessRequests(false);
    }
  };

  const handleRequestResponse = async (requestUsername, action) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${import.meta.env.VITE_API_AUTH_URL}/team-members-access-response`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ userID, organizationID, requestUsername, action })
      });
      fetchAccessRequests();
      fetchTeamMembers();
    } catch (error) {
      if (!backendError) {
        showDialog({ title: "Alert", message: "rror processing request. Please try again." })
      }
    }
  };

  const handleRemove = async (memberUsername) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${import.meta.env.VITE_API_AUTH_URL}/remove-team-member`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ userID, organizationID, memberUsername })
      });
      fetchTeamMembers();
    } catch (error) { }
  };

  const handlePermissionChange = async (username, isAdmin) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${import.meta.env.VITE_API_AUTH_URL}/team-members-permissions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ userID, organizationID, username, is_admin: isAdmin })
      });
      setTeamMembers((prev) =>
        prev.map((m) => (m.username === username ? { ...m, is_admin: isAdmin ? "true" : "member" } : m))
      );
    } catch (error) { }
    setOpenPermissionDropdown(null);
  };

  const currentUser = teamMembers.find(member => member.username === userID);
  const isCurrentUserAdmin = currentUser?.is_admin === "true";

  const filteredTeamMembers = teamMembers.filter(member => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return member.first_name?.toLowerCase().includes(lower) || member.last_name?.toLowerCase().includes(lower) || member.email?.toLowerCase().includes(lower);
  });

  const filteredAccessRequests = accessRequests.filter(req => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return req.first_name?.toLowerCase().includes(lower) || req.last_name?.toLowerCase().includes(lower) || req.email?.toLowerCase().includes(lower);
  });

  const retryFetch = () => {
    setBackendError(false);
    fetchTeamMembers();
    if (teamPage === "requests") {
      fetchAccessRequests();
    }
  };

  return (
    <div
      className="teamPageWrapper"
      style={{
        background: "background: #08090c",
        display: screenSize >= 5300 ? "none" : ""
      }}
    >
      <Nav activePage="main" />
      {isLoaded ? (
        backendError ? (
          <div className="disconnectedNoResults" style={{ height: "100%" }}>
            <div className="disconnectedNoResultCell">
              <FontAwesomeIcon icon={faGlobe} size="3x" className="disconnectedNoResultsIcon" />
              <div className="disconnectedNoResultsText">Unable to connect to the server. Please check your internet connection and try again.</div>
              <div className="disconnectedNoResultsButtons">
                <button className="disconnectedNoResultsRefresh" onClick={retryFetch}>
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="teamCellHeaderContainer">
            <div className="teamNavBar">
              <button
                style={{
                  borderBottom: teamPage === "manage" ? "2px solid #4ECDC4" : "none",
                  color: teamPage === "manage" ? "#4ECDC4" : ""
                }}
                onClick={() => setTeamPage("manage")}
              >
                Manage Team
              </button>
              <button
                style={{
                  borderBottom: teamPage === "requests" ? "2px solid #4ECDC4" : "none",
                  color: teamPage === "requests" ? "#4ECDC4" : ""
                }}
                onClick={() => setTeamPage("requests")}
              >
                Access Requests
              </button>
            </div>

            <div className="teamTopBar">
              <div className="teamTopBarSearchContainer">
                <div className="teamSearchBarWrapper">
                  <FontAwesomeIcon icon={faSearch} className="teamSearchIcon" />
                  <input
                    type="text"
                    className="teamSearchInput"
                    value={searchText}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={teamPage === "manage" ? "Search team..." : "Search requests..."}
                  />
                  <FontAwesomeIcon
                    icon={faCircleInfo}
                    className="docsSearchIconSupplement"
                  />
                </div>
              </div>
            </div>

            {teamPage === "manage" && (
              <div className="teamListContainer">
                {isLoadingTeamMembers ? (
                  <div className="loading-wrapper" style={{ display: "flex", justifyContent: "center", width: "100%", height: "calc(100vh - 220px)" }}>
                    <div className="loading-circle" />
                  </div>
                ) : filteredTeamMembers.length === 0 ? (
                  <div className="teamNoResults" style={{ height: "calc(100vh - 220px)" }}>
                    <div className="teamNoResultCell">
                      <div className="teamNoResultsText">No team members found.</div>
                      <div className="teamNoResultsButtons">
                        <button
                          className="teamNoResultsRefresh"
                          onClick={fetchAccessRequests}
                          disabled={isLoadingAccessRequests}
                        >
                          Refresh Requests
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  filteredTeamMembers.map((member, i) => (
                    <div key={i} className="teamListItemCollapsed">
                      <div className="teamContentMemberRowLeading">
                        <img src={member.image || "TestImage.png"} />
                        <span>
                          <strong>
                            {member.first_name} {member.last_name}
                          </strong>
                          <p>{member.email}</p>
                        </span>
                      </div>
                      <div className="teamContentMemberRowTrailing">
                        <div className="permissionDropdownWrapper">
                          <button
                            ref={openPermissionDropdown === member.username ? rowPermSelectRef : null}
                            className="permissionDropdownButton"
                            disabled={member.username === userID || !isCurrentUserAdmin}
                            style={member.username === userID || !isCurrentUserAdmin ? { opacity: 0.6 } : {}}
                            onClick={() =>
                              setOpenPermissionDropdown((prev) => (prev === member.username ? null : member.username))
                            }
                          >
                            {member.is_admin === "true" ? "Admin" : "Team Member"}
                            <FontAwesomeIcon
                              icon={faCaretDown}
                              className="addNewCaretIcon"
                              style={{
                                transform: openPermissionDropdown === member.username ? "rotate(180deg)" : "rotate(0deg)",
                                transition: "transform 0.3s ease"
                              }}
                            />
                          </button>
                          {openPermissionDropdown === member.username && member.username !== userID && isCurrentUserAdmin && (
                            <div
                              ref={rowPermDropdownRef}
                              className="teamDropdownMenu"
                              style={{
                                position: "fixed",
                                top: rowPermDropdownPosition.top,
                                left: rowPermDropdownPosition.left,
                                zIndex: 1000
                              }}
                            >
                              <button onClick={() => handlePermissionChange(member.username, true)}>
                                Admin
                                <FontAwesomeIcon icon={faListUl} />
                              </button>
                              <button onClick={() => handlePermissionChange(member.username, false)}>
                                Team Member
                                <FontAwesomeIcon icon={faListUl} />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          disabled={member.username === userID || !isCurrentUserAdmin}
                          style={{
                            backgroundColor: "rgba(229, 75, 75, 0.1)",
                            border: "1px solid #E54B4B",
                            color: "rgba(235, 240, 248, 0.95)",
                            opacity: member.username === userID || !isCurrentUserAdmin ? 0.6 : 1
                          }}
                          onClick={() => handleRemove(member.username)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}


            {teamPage === "requests" && (
              <div className="teamListContainer">
                {isLoadingAccessRequests ? (
                  <div className="loading-wrapper" style={{ display: "flex", justifyContent: "center", width: "100%", height: "calc(100vh - 220px)" }}>
                    <div className="loading-circle" />
                  </div>
                ) : filteredAccessRequests.length === 0 ? (
                  <div className="teamNoResults" style={{ height: "calc(100vh - 220px)" }}>
                    <div className="teamNoResultCell">
                      <div className="teamNoResultsText">No current access requests.</div>
                      <div className="teamNoResultsButtons">
                        <button
                          className="teamNoResultsRefresh"
                          onClick={fetchAccessRequests}
                          disabled={isLoadingAccessRequests}
                        >
                          Refresh Requests
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  filteredAccessRequests.map((req, i) => (
                    <div key={i} className="teamListItemCollapsed">
                      <div className="teamContentMemberRowLeading">
                        <img src={req.image || "TestImage.png"} />
                        <span>
                          <strong>
                            {req.first_name} {req.last_name}
                          </strong>
                          <p>{req.email}</p>
                        </span>
                      </div>
                      <div className="teamContentMemberRowTrailing">
                        <button onClick={() => handleRequestResponse(req.request_username, "approve")}>Confirm</button>
                        <button
                          style={{
                            backgroundColor: "rgba(229, 75, 75, 0.1)",
                            border: "1px solid #E54B4B",
                            color: "rgba(235, 240, 248, 0.95)"
                          }}
                          onClick={() => handleRequestResponse(req.request_username, "deny")}
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="teamCellHeaderContainer" style={{ justifyContent: "center" }}>
          <div className="loading-wrapper">
            <div className="loading-circle" />
            <label className="loading-title">Stack Forge</label>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;