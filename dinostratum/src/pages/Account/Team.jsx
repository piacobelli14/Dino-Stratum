import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsersGear, faUsers, faUserPlus, faSearch, faGlobe
} from "@fortawesome/free-solid-svg-icons";
import Nav from "../../helpers/Nav";
import Dropdown from "../../helpers/Dropdown.jsx";
import { showDialog } from "../../helpers/Alert.jsx";
import useAuth from "../../UseAuth.jsx";
import useIsTouchDevice from "../../TouchDevice.jsx";
import "../../styles/mainStyles/Account/Team.css";
import "../../styles/helperStyles/LoadingSpinner.css";
import "../../styles/helperStyles/Disconnected.css";

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
    <div className="teamPageWrapper" style={{ display: screenSize >= 5300 ? "none" : "" }}>
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
            <div className="teamCellContentWrapper">
              <div className="teamContentSideBar">
                <div className="teamSideBarButtonWrapper">
                  <div className="teamSideBarSection">
                    <div className="teamSideBarSectionTitle">
                      <FontAwesomeIcon icon={faUsersGear} />
                      Team
                    </div>
                    <div className="teamSideBarButtons">
                      <button
                        className={teamPage === "manage" ? "teamSideBarButton active" : "teamSideBarButton"}
                        onClick={() => setTeamPage("manage")}
                      >
                        <FontAwesomeIcon icon={faUsers} />
                        <span>Manage Team</span>
                      </button>
                      <button
                        className={teamPage === "requests" ? "teamSideBarButton active" : "teamSideBarButton"}
                        onClick={() => setTeamPage("requests")}
                      >
                        <FontAwesomeIcon icon={faUserPlus} />
                        <span>Access Requests</span>
                      </button>
                    </div>
                  </div>
                  <div className="teamSideBarSection">
                    <div className="teamSideBarSectionTitle">
                      <FontAwesomeIcon icon={faSearch} />
                      Search
                    </div>
                    <input
                      type="text"
                      className="teamSearchInput"
                      value={searchText}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder={teamPage === "manage" ? "Search Team" : "Search Requests"}
                    />
                  </div>
                </div>
              </div>
              <div className="teamContentMainFlex">
                <div className="teamContentMainScroll">
                  {teamPage === "manage" && (
                    isLoadingTeamMembers ? (
                      <div className="loading-wrapper" style={{ display: "flex", justifyContent: "center", width: "100%", height: "100%" }}>
                        <div className="loading-circle" />
                        <label className="loading-title">
                          Loading
                        </label>
                      </div>
                    ) : filteredTeamMembers.length === 0 ? (
                      <div className="teamNoResults">
                        <div className="teamNoResultCell">
                          <div className="teamNoResultsText">No team members found.</div>
                          <div className="teamNoResultsButtons">
                            <button
                              className="teamNoResultsRefresh"
                              onClick={fetchTeamMembers}
                              disabled={isLoadingTeamMembers}
                            >
                              Refresh Team
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
                            <div className={member.username === userID || !isCurrentUserAdmin ? "teamPermissionDropdownDisabled" : ""}>
                              <Dropdown
                                className="teamPermissionDropdown"
                                value={member.is_admin === "true" ? "Admin" : "Team Member"}
                                onChange={(label) => handlePermissionChange(member.username, label === "Admin")}
                                options={["Admin", "Team Member"]}
                                placeholder="Role"
                              />
                            </div>
                            <button
                              className="teamDangerButton"
                              disabled={member.username === userID || !isCurrentUserAdmin}
                              onClick={() => handleRemove(member.username)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {teamPage === "requests" && (
                    isLoadingAccessRequests ? (
                      <div className="loading-wrapper" style={{ display: "flex", justifyContent: "center", width: "100%", height: "100%" }}>
                        <div className="loading-circle" />
                        <label className="loading-title">
                          Loading
                        </label>
                      </div>
                    ) : filteredAccessRequests.length === 0 ? (
                      <div className="teamNoResults">
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
                              className="teamDangerButton"
                              onClick={() => handleRequestResponse(req.request_username, "deny")}
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="teamCellHeaderContainer" style={{ justifyContent: "center" }}>
          <div className="loading-wrapper">
            <div className="loading-circle" />
            <label className="loading-title">
              Loading
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;