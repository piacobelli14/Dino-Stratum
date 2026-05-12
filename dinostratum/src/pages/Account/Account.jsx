import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faUserGear, faUsersGear, faPersonChalkboard, faLock, faChartColumn, faMoneyBills, faGear, faPenToSquare, faClone, faSquareCheck, faHammer, faSquareXmark, faGlobe, faClock } from "@fortawesome/free-solid-svg-icons";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import "../../styles/mainStyles/Account/Account.css";
import "../../styles/helperStyles/LoadingSpinner.css";
import "../../styles/helperStyles/Disconnected.css";
import Nav from "../../helpers/Nav";
import { showDialog } from "../../helpers/Alert.jsx";
import useAuth from "../../UseAuth";
import useIsTouchDevice from "../../TouchDevice.jsx";

const Account = () => {
    const navigate = useNavigate();
    const isTouchDevice = useIsTouchDevice();
    const location = useLocation();
    const { token, userID, loading, organizationID } = useAuth();

    const settingsButtons = [
        { state: "general", label: "general", icon: faGear },
        { state: "personal", label: "my account", icon: faUserGear },
        { state: "team", label: "my team", icon: faUsersGear },
        { state: "security", label: "security", icon: faLock },
        { state: "data", label: "data sharing", icon: faChartColumn },
        { state: "github", label: "github account", icon: faGithub },
        { state: "billing", label: "billing", icon: faMoneyBills }
    ];

    const timezones = [
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid",
        "Europe/Amsterdam", "Europe/Stockholm", "Europe/Zurich", "Asia/Tokyo", "Asia/Shanghai",
        "Asia/Hong_Kong", "Asia/Singapore", "Asia/Seoul", "Asia/Mumbai", "Asia/Dubai",
        "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "America/Mexico_City",
        "America/Sao_Paulo", "America/Buenos_Aires", "Africa/Cairo", "Africa/Johannesburg"
    ];

    const [isLoaded, setIsLoaded] = useState(false);
    const [screenSize, setScreenSize] = useState(window.innerWidth);
    const [resizeTrigger, setResizeTrigger] = useState(false);
    const [backendError, setBackendError] = useState(false);

    const [userDetails, setUserDetails] = useState({
        email: "",
        firstName: "",
        lastName: "",
        image: "",
        phone: "",
        role: "",
        timezone: "",
        isAdmin: "",
        twofaEnabled: false,
        loginNotis: false,
        exportNotis: false,
        dataSharing: false,
        gitID: "",
        gitUsername: "",
        gitImage: "",
        orgID: "",
        orgName: "",
        orgEmail: "",
        orgPhone: "",
        orgDesc: "",
        orgImage: "",
        orgCreated: "",
        isSubscribed: false
    });

    const [detectedTimezone, setDetectedTimezone] = useState("");
    const [activeAccessRequest, setActiveAccessRequest] = useState(false);
    const [activeAccessRequestMessage, setActiveAccessRequestMessage] = useState("");

    const { settingsState: initialSettingsState } = location.state || {};
    const [settingsState, setSettingsState] = useState(initialSettingsState || "general");

    const [editModes, setEditModes] = useState({
        firstName: false,
        lastName: false,
        email: false,
        phone: false,
        role: false,
        timezone: false,
        orgName: false,
        orgEmail: false,
        orgPhone: false
    });

    const [usernameCopied, setUsernameCopied] = useState(false);
    const [orgIDCopied, setOrgIDCopied] = useState(false);
    const [orgSlugCopied, setOrgSlugCopied] = useState(false);
    const [personalSlugCopied, setPersonalSlugCopied] = useState(false);
    const [gitUsernameCopied, setGitUsernameCopied] = useState(false);
    const [gitIDCopied, setGitIDCopied] = useState(false);

    const [createTeamMessage, setCreateTeamMessage] = useState("");
    const [joinTeamMessage, setJoinTeamMessage] = useState("");
    const [createTeamError, setCreateTeamError] = useState("");
    const [joinTeamError, setJoinTeamError] = useState("");
    const [teamName, setTeamName] = useState("");
    const [teamSlug, setTeamSlug] = useState("");
    const [teamCode, setTeamCode] = useState("");

    const [teamCreationLogout, setTeamCreationLogout] = useState(false);
    const [isTeamCreateLoad, setIsTeamCreateLoad] = useState(false);
    const [isTeamJoinLoad, setIsTeamJoinLoad] = useState(false);
    const [isPasswordLoad, setIsPasswordLoad] = useState(false);

    const capitalizeWords = str => str.replace(/\b\w/g, char => char.toUpperCase());

    const formatPhoneNumber = value => value.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const year = date.getFullYear();
        return month + "/" + day + "/" + year;
    };

    const copyText = text => {
        navigator.clipboard.writeText(text);
    };

    const detectBrowserTimezone = () => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (error) {
            return "America/New_York";
        }
    };

    const fetchUserInfo = async (userID) => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/user-info`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, organizationID })
            });
            const data = await response.json();
            const d = data[0];
            setUserDetails({
                email: d.email,
                firstName: d.firstname,
                lastName: d.lastname,
                image: d.image,
                phone: d.phone,
                role: d.role,
                timezone: d.timezone || detectedTimezone,
                slug: d.slug,
                isAdmin: d.isadmin,
                twofaEnabled: d.twofa,
                loginNotis: d.loginnotis,
                exportNotis: d.exportnotis,
                dataSharing: d.datashare,
                gitID: d.gitid,
                gitUsername: d.gitusername,
                gitImage: d.gitimage,
                orgID: d.orgid,
                orgName: d.organizationname,
                orgEmail: d.organizationemail,
                orgPhone: d.organizationphone,
                orgDesc: d.organizationdescription,
                orgImage: d.organizationimage,
                orgCreated: d.organizationcreated,
                orgSlug: d.organizationslug,
                isSubscribed: d.issubscribed,
                autoDiscoverRun: d.autoDiscoverRun,
                autoDiscoverDev: d.autoDiscoverDev,
                autoDiscoverPackage: d.autoDiscoverPackage
            });
        } catch (error) {
            if (error instanceof TypeError) {
                setBackendError(true);
            }
        }
    };

    const fetchAccessRequests = async (userID) => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/personal-access-requests`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID })
            });

            const data = await response.json();
            const requests = data.accessRequests;
            if (requests.length > 0 &&
                requests[0].request_username === userID &&
                requests[0].request_status === "Current"
            ) {
                setActiveAccessRequest(true);
                setActiveAccessRequestMessage(`You have an active access request to join the team ${requests[0].team_name}. We are still waiting on the team's admins to approve your request.`);
            } else {
                setActiveAccessRequest(false);
                setActiveAccessRequestMessage("");
            }
        } catch (error) {
            if (error instanceof TypeError) {
                setBackendError(true);
            }
        }
    };

    const handleUserImageChange = async e => {
        const file = e.target.files[0];
        if (!file) return await showDialog({ title: "Alert", message: "No file selected." });
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result;
                setUserDetails(prev => ({ ...prev, image: base64Data }));
                try {
                    const token = localStorage.getItem("token");
                    if (!token) return;
                    const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-user-image`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ userID, organizationID, image: base64Data })
                    });
                    if (!response.ok) return await showDialog({ title: "Alert", message: `Error uploading image: ${response.status} - ${await response.text()}` });
                    e.target.value = "";
                } catch (uploadError) {
                    await showDialog({ title: "Alert", message: `Image upload failed: ${uploadError.message}` });
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `An error occurred: ${error.message}` });
            }
        }
    };

    const handleTeamImageChange = async e => {
        const file = e.target.files[0];
        if (!file) return await showDialog({ title: "Alert", message: "No file selected." });
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result;
                setUserDetails(prev => ({ ...prev, orgImage: base64Data }));
                try {
                    const token = localStorage.getItem("token");
                    if (!token) return;
                    const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-team-image`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ userID, organizationID, image: base64Data })
                    });
                    if (!response.ok) return await showDialog({ title: "Alert", message: `Error uploading image: ${response.status} - ${await response.text()}` });
                    e.target.value = "";
                } catch (uploadError) {
                    if (!backendError) {
                        await showDialog({ title: "Alert", message: `Image upload failed: ${uploadError.message}` });
                    }
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `An error occurred: ${error.message}` });
            }
        }
    };

    const handleSaveUserInfo = async (fieldKey, value) => {
        const endpoints = {
            firstName: "edit-user-first-name",
            lastName: "edit-user-last-name",
            email: "edit-user-email",
            phone: "edit-user-phone",
            role: "edit-user-role",
            timezone: "edit-user-timezone"
        };
        if (value === "" || !value) {
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/` + endpoints[fieldKey], {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, [fieldKey]: value })
            });
            setEditModes(prev => ({ ...prev, [fieldKey]: false }));
        } catch (error) { }
    };

    const handleSaveTeamInfo = async (fieldKey, value) => {
        const endpoints = {
            orgName: "edit-team-name",
            orgEmail: "edit-team-email",
            orgPhone: "edit-team-phone"
        };
        if (value === "" || !value) {
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/` + endpoints[fieldKey], {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, organizationID, [fieldKey]: value })
            });

            setEditModes(prev => ({ ...prev, [fieldKey]: false }));
            await fetchUserInfo(userID);
        } catch (error) { }
    };

    const handleAccountDelete = async () => {
        const result = await showDialog({
            title: "Confirm Account Deletion",
            message: "Type 'delete my account' to confirm deletion.",
            inputs: [{ name: "confirmation", type: "text", defaultValue: "" }],
            showCancel: true
        });
        if (!result || result.confirmation !== "delete my account") {
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/delete-user`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID })
            });
            if (response.status === 200) {
                navigate("/login");
            }
        } catch (error) {
            return;
        }
    };

    const handleTeamDelete = async () => {
        const result = await showDialog({
            title: "Confirm Team Deletion",
            message: "Type 'delete my team' to confirm deletion.",
            inputs: [{ name: "confirmation", type: "text", defaultValue: "" }],
            showCancel: true
        });
        if (!result || result.confirmation !== "delete my team") {
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/delete-team`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, organizationID })
            });
            if (response.status === 200) {
                navigate("/login");
            }
        } catch (error) {
            return;
        }
    };

    const handleTeamCreation = async () => {
        setIsTeamCreateLoad(true);
        if (teamName === "" || !teamName) {
            setCreateTeamError("Please enter a valid team name.");
            setIsTeamCreateLoad(false);
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/create-team`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, teamName })
            });
            const data = await response.json();
            if (response.status === 200) {
                setCreateTeamMessage("Your new team has been created successfully.");
                setTeamCreationLogout(true);
                setTimeout(() => {
                    setIsTeamCreateLoad(false);
                }, 1000);
            } else {
                setCreateTeamError(data.message || "That team name is either taken or invalid. Please select another.");
                setIsTeamCreateLoad(false);
            }
        } catch (error) {
            setCreateTeamError("An error occurred while creating the team. Please try again.");
            setIsTeamCreateLoad(false);
        }
    };

    const handleTeamJoin = async () => {
        setIsTeamJoinLoad(true);
        if (teamCode === "" || !teamCode) {
            setJoinTeamError("Please enter a valid access code.");
            setIsTeamJoinLoad(false);
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/join-team`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    userID,
                    firstName: userDetails.firstName,
                    lastName: userDetails.lastName,
                    teamCode
                })
            });
            if (response.status !== 200) {
                const data = await response.json();
                setJoinTeamError(data.message || "Unable to process your request. Please verify your code and try again.");
                setIsTeamJoinLoad(false);
            } else {
                setJoinTeamMessage("An access request has been sent to the appropriate administrators.");
                window.location.reload();
                setTimeout(() => {
                    setIsTeamJoinLoad(false);
                }, 1000);
            }
        } catch (error) {
            setJoinTeamError("An error occurred while joining the team. Please try again.");
            setIsTeamJoinLoad(false);
        }
    };

    const handleGithubConnect = async (userID) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                return;
            }
            window.open(`${import.meta.env.VITE_API_AUTH_URL}/connect-github?token=${token}&userID=${userID}`, "_blank");
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: "Error connecting GitHub: " + error.message });
            }
        }
    };

    const handleGithubDisconnect = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/delete-github`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                await fetchUserInfo(userID);
                window.location.reload();
            } else {
                const errorData = await response.json();
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: "Error disconnecting GitHub: " + error.message });
            }
        }
    };

    const handleRevokeAccessRequest = async () => {
        const token = localStorage.getItem("token");
        const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/revoke-access-request`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ userID })
        });
        if (response.status === 200) {
            window.location.reload();
        }
    };

    const handleUsernameCopy = () => {
        copyText(userID);
        setUsernameCopied(true);
        setTimeout(() => setUsernameCopied(false), 2000);
    };

    const handleOrgIDCopy = () => {
        copyText(userDetails.orgID);
        setOrgIDCopied(true);
        setTimeout(() => setOrgIDCopied(false), 2000);
    };

    const handleOrgSlugCopy = () => {
        copyText(userDetails.orgSlug);
        setOrgSlugCopied(true);
        setTimeout(() => setOrgSlugCopied(false), 2000);
    };

    const handlePersonalSlugCopy = () => {
        copyText(userDetails.slug);
        setPersonalSlugCopied(true);
        setTimeout(() => setPersonalSlugCopied(false), 2000);
    };

    const handleGitUsernameCopy = () => {
        copyText(userDetails.gitUsername);
        setGitUsernameCopied(true);
        setTimeout(() => setGitUsernameCopied(false), 2000);
    };

    const handleGitIDCopy = () => {
        copyText(userDetails.gitID);
        setGitIDCopied(true);
        setTimeout(() => setGitIDCopied(false), 2000);
    };

    const handleToggleTwoFA = async () => {
        const token = localStorage.getItem("token");
        const newValue = !userDetails.twofaEnabled;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-user-twofa`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, twoFA: newValue })
            });
            if (response.ok) {
                setUserDetails(prev => ({ ...prev, twofaEnabled: newValue }));
            } else {
                const msg = await response.text();
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Error toggling 2FA: ${response.status} - ${msg}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error toggling 2FA: ${error.message}` });
            }
        }
    };

    const handleToggleLoginNotifs = async () => {
        const token = localStorage.getItem("token");
        const newValue = !userDetails.loginNotis;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-user-loginnotifs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, loginNotif: newValue })
            });
            if (response.ok) {
                setUserDetails(prev => ({ ...prev, loginNotis: newValue }));
            } else {
                const msg = await response.text();
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Error toggling login notifications: ${response.status} - ${msg}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error toggling login notifications: ${error.message}` });
            }
        }
    };

    const handleToggleExportNotifs = async () => {
        const token = localStorage.getItem("token");
        const newValue = !userDetails.exportNotis;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-user-exportnotifs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, exportNotif: newValue })
            });
            if (response.ok) {
                setUserDetails(prev => ({ ...prev, exportNotis: newValue }));
            } else {
                const msg = await response.text();
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Error toggling export notifications: ${response.status} - ${msg}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error toggling export notifications: ${error.message}` });
            }
        }
    };

    const handleToggleDataShare = async () => {
        const token = localStorage.getItem("token");
        const newValue = !userDetails.dataSharing;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-user-datashare`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, dataShare: newValue })
            });
            if (response.ok) {
                setUserDetails(prev => ({ ...prev, dataSharing: newValue }));
            } else {
                const msg = await response.text();
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Error toggling Data Sharing: ${response.status} - ${msg}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error toggling Data Sharing: ${error.message}` });
            }
        }
    };

    const handleEditAutoDiscovery = async (key, newValue) => {
        const columnMap = {
            run: "auto_discover_run",
            dev: "auto_discover_dev",
            package: "auto_discover_package"
        };
        try {
            await fetch(`${import.meta.env.VITE_API_AUTH_URL}/edit-auto-discovery`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    userID,
                    organizationID,
                    field: columnMap[key],
                    value: newValue
                }),
            });
            setUserDetails(prev => ({
                ...prev,
                autoDiscoverRun: key === "run" ? newValue : prev.autoDiscoverRun,
                autoDiscoverDev: key === "dev" ? newValue : prev.autoDiscoverDev,
                autoDiscoverPackage: key === "package" ? newValue : prev.autoDiscoverPackage
            }));
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Error", message: "Failed to update setting. Please try again." });
            }
        }
    };

    const handleCreateCheckoutSession = async () => {
        try {
            const token = localStorage.getItem("token");
            const priceID = "price_XXXXXXXXXXXXXX";
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/create-checkout-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID, priceID })
            });
            const data = await response.json();
            if (data.sessionID) {
                window.location.href = `https://checkout.stripe.com/pay/${data.sessionID}`;
            } else {
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Unable to create checkout session: ${data.message}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error creating checkout session: ${error.message}` });
            }
        }
    };

    const handleManageBilling = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/billing-portal`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID })
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Unable to open billing portal: ${data.message}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error opening billing portal: ${error.message}` });
            }
        }
    };

    const handleCancelSubscription = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/cancel-subscription`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ userID })
            });
            if (response.ok) {
                await fetchUserInfo(userID);
                window.location.reload();
            } else {
                const msg = await response.text();
                if (!backendError) {
                    await showDialog({ title: "Alert", message: `Error canceling subscription: ${response.status} - ${msg}` });
                }
            }
        } catch (error) {
            if (!backendError) {
                await showDialog({ title: "Alert", message: `Error canceling subscription: ${error.message}` });
            }
        }
    };

    const retryFetch = () => {
        setIsLoaded(false);
        setBackendError(false);
        const fetchData = async () => {
            try {
                await fetchUserInfo(userID);
                await fetchAccessRequests(userID);
                setIsLoaded(true);
            } catch (error) { }
        };
        fetchData();
    };

    useEffect(() => {
        if (!loading && !token) navigate("/login");
    }, [token, loading, navigate]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                await fetchUserInfo(userID);
                await fetchAccessRequests(userID);
                setIsLoaded(true);
            } catch (error) { }
        };
        if (!loading && token) fetchData();
    }, [userID, loading, token]);

    useEffect(() => {
        const browserTimezone = detectBrowserTimezone();
        setDetectedTimezone(browserTimezone);
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsLoaded(false);
            setScreenSize(window.innerWidth);
            setResizeTrigger(prev => !prev);
            setTimeout(() => setIsLoaded(true), 300);
        };
        if (!isTouchDevice) {
            window.addEventListener("resize", handleResize);
            return () => window.removeEventListener("resize", handleResize);
        }
    }, []);

    useEffect(() => {
        if (teamCreationLogout) {
            setIsLoaded(false);
            setTimeout(() => {
                localStorage.removeItem("token");
                localStorage.removeItem("userid");
                localStorage.removeItem("orgid");
                navigate("/login");
            }, 1200);
        }
    }, [teamCreationLogout]);

    useEffect(() => {
        if (createTeamMessage !== "") {
            setCreateTeamError("");
        }
    }, [createTeamMessage]);

    useEffect(() => {
        if (createTeamError !== "") {
            setCreateTeamMessage("");
        }
    }, [createTeamError]);

    useEffect(() => {
        if (joinTeamMessage !== "") {
            setJoinTeamError("");
        }
    }, [joinTeamMessage]);

    useEffect(() => {
        if (joinTeamError !== "") {
            setJoinTeamMessage("");
        }
    }, [joinTeamError]);

    return (
        <div className="profilePageWrapper" style={{ display: screenSize >= 5300 && screenSize < 700 ? "none" : "" }}>
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
                    <div className="profileCellHeaderContainer">
                        <div className="profileCellContentWrapper">
                            <div className="profileContentSideBar">
                                <div className="profileSideBarButtonWrapper">
                                    {settingsButtons.map(btn => (
                                        <button key={btn.state} className={"profileSideBarButton " + (settingsState === btn.state ? "profileSideBarButton--selected" : "")} onClick={() => setSettingsState(btn.state)}>
                                            <span>
                                                <FontAwesomeIcon icon={btn.icon} /> <small>{capitalizeWords(btn.label)}</small>
                                            </span>
                                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="profileContentMainFlex">
                                <div className="profileContentMainScroll">
                                    {settingsState === "general" && (
                                        <>
                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>Profile Picture</h3>
                                                        <p>
                                                            Your user profile image serves as your avatar. It is what other users will see you as.
                                                            Click on it to upload a custom one.
                                                        </p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <label className="profileUserImageWrapper" htmlFor="userImageUpload" style={{ background: userDetails.image && userDetails.image !== "" ? "none" : "", boxShadow: userDetails.image && userDetails.image !== "" ? "none" : "" }}>
                                                            <img src={userDetails.image} className="profileUserImage" alt="" />
                                                        </label>
                                                        <input style={{ display: "none", padding: 0 }} type="file" id="userImageUpload" accept="image/*" onChange={handleUserImageChange} />
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>A profile picture for your account is required.</p>
                                                </div>
                                            </div>

                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>Personal Information</h3>
                                                        <p>This is your first and last name as they will be displayed to other users.</p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <div className="profileFieldInput">
                                                            <strong>First Name</strong>
                                                            <span>
                                                                <input placeholder={userDetails.firstName} disabled={!editModes.firstName} onChange={e => setUserDetails(prev => ({ ...prev, firstName: e.target.value }))} />
                                                                <button className="profileEditButton" onClick={() => editModes.firstName ? handleSaveUserInfo("firstName", userDetails.firstName) : setEditModes(prev => ({ ...prev, firstName: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.firstName ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.firstName &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, firstName: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                            <strong>Last Name</strong>
                                                            <span>
                                                                <input placeholder={userDetails.lastName} disabled={!editModes.lastName} onChange={e => setUserDetails(prev => ({ ...prev, lastName: e.target.value }))} />
                                                                <button className="profileEditButton" onClick={() => editModes.lastName ? handleSaveUserInfo("lastName", userDetails.lastName) : setEditModes(prev => ({ ...prev, lastName: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.lastName ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.lastName &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, lastName: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>Your first and last name is required.</p>
                                                </div>
                                            </div>

                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>Contact Information</h3>
                                                        <p>This is the email address and phone number associated with your account. It will not be displayed to others.</p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <div className="profileFieldInput">
                                                            <strong>Email Address</strong>
                                                            <span>
                                                                <input placeholder={userDetails.email} disabled={!editModes.email} onChange={e => setUserDetails(prev => ({ ...prev, email: e.target.value }))} />
                                                                <button className="profileEditButton" onClick={() => editModes.email ? handleSaveUserInfo("email", userDetails.email) : setEditModes(prev => ({ ...prev, email: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.email ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.email &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, email: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                            <strong>Phone Number</strong>
                                                            <span>
                                                                <input placeholder={formatPhoneNumber(userDetails.phone)} disabled={!editModes.phone} onChange={e => setUserDetails(prev => ({ ...prev, phone: e.target.value }))} />
                                                                <button className="profileEditButton" onClick={() => editModes.phone ? handleSaveUserInfo("phone", userDetails.phone) : setEditModes(prev => ({ ...prev, phone: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.phone ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.phone &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, phone: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>Your email address and phone number are required.</p>
                                                </div>
                                            </div>

                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>Role</h3>
                                                        <p>This is your self-described position or role. It is not related to your team and it does not influence your permissions.</p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                            <strong>Role</strong>
                                                            <span>
                                                                <input placeholder={userDetails.role} disabled={!editModes.role} onChange={e => setUserDetails(prev => ({ ...prev, role: e.target.value }))} />
                                                                <button className="profileEditButton" onClick={() => editModes.role ? handleSaveUserInfo("role", userDetails.role) : setEditModes(prev => ({ ...prev, role: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.role ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.role &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, role: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>Assigning yourself a role is not required, but highly recommended.</p>
                                                </div>
                                            </div>

                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>Timezone Preference</h3>
                                                        <p>Set your preferred timezone for accurate timestamps and scheduling. We detected your browser timezone and location-based timezone as suggestions.</p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <div className="profileFieldInput">
                                                            <strong>Current Timezone</strong>
                                                            <span>
                                                                {editModes.timezone ? (
                                                                    <select
                                                                        value={userDetails.timezone}
                                                                        onChange={e => setUserDetails(prev => ({ ...prev, timezone: e.target.value }))}
                                                                        style={{
                                                                            color: "#E7E7E7",
                                                                            backgroundColor: "rgba(0,0,0,0.2)",
                                                                            boxShadow: "0 0 4px rgba(0,0,0,0.8)",
                                                                            fontSize: "0.6rem",
                                                                            fontWeight: "600",
                                                                            border: "0.2vh solid #E7E7E7",
                                                                            borderRadius: "4px",
                                                                            width: "70%",
                                                                            padding: "0.5rem 0.6rem"
                                                                        }}
                                                                    >
                                                                        {timezones.map(tz => (
                                                                            <option key={tz} value={tz}>{tz}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <input placeholder={userDetails.timezone || detectedTimezone} disabled={true} />
                                                                )}
                                                                <button className="profileEditButton" onClick={() => editModes.timezone ? handleSaveUserInfo("timezone", userDetails.timezone) : setEditModes(prev => ({ ...prev, timezone: true }))}>
                                                                    <FontAwesomeIcon icon={editModes.timezone ? faSquareCheck : faPenToSquare} />
                                                                </button>
                                                                {editModes.timezone &&
                                                                    <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, timezone: false })) }}>
                                                                        <FontAwesomeIcon icon={faSquareXmark} />
                                                                    </button>
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                            <strong>Detected: {detectedTimezone}</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>Setting your timezone helps us display accurate times for your activities and scheduling.</p>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {settingsState === "personal" && (
                                        <>
                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack">
                                                        <h3>User Information</h3>
                                                        <p>
                                                            This is the username and slug you selected when you created your account.
                                                            This is what other users will see when they see you.
                                                        </p>
                                                    </div>
                                                    <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <div className="profileFieldInput">
                                                            <strong>Username</strong>
                                                            <span>
                                                                <input placeholder={userID} disabled={true} />
                                                                <button className="profileEditButton" onClick={handleUsernameCopy} style={{ opacity: usernameCopied ? "0.6" : "1.0" }}>
                                                                    <FontAwesomeIcon icon={usernameCopied ? faSquareCheck : faClone} />
                                                                </button>
                                                            </span>
                                                        </div>

                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                            <strong>Personal Slug</strong>
                                                            <span>
                                                                <input placeholder={userDetails.slug} disabled={true}/>
                                                                <button className="profileEditButton" onClick={handlePersonalSlugCopy} style={{ opacity: personalSlugCopied ? "0.6" : "1.0" }}>
                                                                    <FontAwesomeIcon icon={personalSlugCopied ? faSquareCheck : faClone} />
                                                                </button>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>You cannot change this username. You can change your display name in the general settings tab.</p>
                                                </div>
                                            </div>

                                            <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                        <h3>Delete Account</h3>
                                                        <p style={{ width: "100%" }}>Permanently delete your Personal Account and all of its contents from the platform. This is irreversible.</p>
                                                        <button className="profileDeleteButton" onClick={handleAccountDelete}>
                                                            Delete Personal Account
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                    <p>This action is not reversible, so please continue with caution.</p>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {settingsState === "team" && (
                                        !userDetails.orgID ? (
                                            <>
                                                {!activeAccessRequest && (
                                                    <div className="profileContentFlexCellElongated" style={{ border: createTeamError !== "" ? "1px solid #E54B4B" : "" }}>
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack">
                                                                <h3>Create a Team</h3>
                                                                <p>If you are not a part of a team or organization, you can create one here. Just enter a team name and you will be given administrative access as the founder.</p>
                                                            </div>
                                                            <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                                {isTeamCreateLoad ? (
                                                                    <div className="loading-circle" />
                                                                ) : (
                                                                    <>
                                                                        <div className="profileFieldInput">
                                                                            <strong>Enter a Team Name</strong>
                                                                            <span>
                                                                                <input placeholder={"New team name..."} onChange={e => setTeamName(e.target.value)} />
                                                                            </span>
                                                                        </div>

                                                                        <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                                            <span>
                                                                                <button className="profileActionButton" onClick={handleTeamCreation}>
                                                                                    Create New Team
                                                                                </button>
                                                                            </span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom" style={{ borderTop: createTeamError !== "" ? "1px solid #E54B4B" : "", backgroundColor: createTeamError !== "" ? "rgba(229, 75, 75, 0.2)" : "" }}>
                                                            {(createTeamMessage === "" && createTeamError === "") && (
                                                                <p>Once you successfully create your team, you will be logged out. Once you sign back in you should see your team info.</p>
                                                            )}
                                                            {(createTeamError !== "") && (
                                                                <p>{createTeamError}</p>
                                                            )}
                                                            {(createTeamError === "" && createTeamMessage !== "") && (
                                                                <p>{createTeamMessage}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {!activeAccessRequest ? (
                                                    <div className="profileContentFlexCell" style={{ border: joinTeamError !== "" ? "1px solid #E54B4B" : "" }}>
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack">
                                                                <h3>Join a Team</h3>
                                                                <p>If you need to join a team, your team administrator should have given you an access code. Once you have it you can enter it here to request access to the team.</p>
                                                            </div>
                                                            <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                                {isTeamJoinLoad ? (
                                                                    <div className="loading-circle" />
                                                                ) : (
                                                                    <>
                                                                        <div className="profileFieldInput">
                                                                            <strong>Enter Your Access Code</strong>
                                                                            <span>
                                                                                <input placeholder={"Access code..."} onChange={e => setTeamCode(e.target.value)} />
                                                                            </span>
                                                                        </div>
                                                                        <div className="profileFieldInput">
                                                                            <span>
                                                                                <button className="profileActionButton" onClick={handleTeamJoin}>
                                                                                    Join Team
                                                                                </button>
                                                                            </span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom" style={{ borderTop: joinTeamError !== "" ? "1px solid #E54B4B" : "", backgroundColor: joinTeamError !== "" ? "rgba(229, 75, 75, 0.2)" : "" }}>
                                                            {(joinTeamMessage === "" && joinTeamError === "") && (
                                                                <p>Once you enter your access code, an access request will be sent to the team admins who can approve or deny your request.</p>
                                                            )}
                                                            {(joinTeamError !== "") && (
                                                                <p>{joinTeamError}</p>
                                                            )}
                                                            {(joinTeamError === "" && joinTeamMessage !== "") && (
                                                                <p>{joinTeamMessage}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                                <h3>Revoke Access Request</h3>
                                                                <p style={{ width: "100%" }}>
                                                                    {activeAccessRequestMessage}
                                                                </p>
                                                                <button className="profileDeleteButton" onClick={handleRevokeAccessRequest}>
                                                                    Revoke Access Request
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                            <p>You may revoke your access request at any time.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>Team Profile Picture</h3>
                                                            <p>
                                                                This is the image associated with your team. It is what other users will see when they look at your team.
                                                            </p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <label className="profileUserImageWrapper" htmlFor="teamImageUpload" style={{ background: userDetails.orgImage && userDetails.orgImage !== "" ? "none" : "", boxShadow: userDetails.orgImage && userDetails.orgImage !== "" ? "none" : "" }}>
                                                                <img src={userDetails.orgImage} className="profileUserImage" alt="" />
                                                            </label>
                                                            <input disabled={userDetails.isAdmin !== "true"} style={{ display: "none", padding: 0 }} type="file" id="teamImageUpload" accept="image/*" onChange={handleTeamImageChange} />
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        {userDetails.isAdmin !== "true" ? (
                                                            <p>Only a team admin is able to change the team's profile picture.</p>
                                                        ) : (
                                                            <p>A team profile picture is not required but highly recommended.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>Team Information</h3>
                                                            <p>This your team's Organization ID and slug. The Organization ID is the code that you will give to new users who need to access your team.</p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <div className="profileFieldInput">
                                                                <strong>Organization ID</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.orgID} disabled={true} />
                                                                    <button className="profileEditButton" onClick={handleOrgIDCopy} style={{ opacity: orgIDCopied ? "0.6" : "1.0" }}>
                                                                        <FontAwesomeIcon icon={orgIDCopied ? faSquareCheck : faClone} />
                                                                    </button>
                                                                </span>
                                                            </div>
                                                            <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                                <strong>Organization Slug</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.orgSlug} disabled={true}/>
                                                                    <button className="profileEditButton" onClick={handleOrgSlugCopy} style={{ opacity: orgSlugCopied ? "0.6" : "1.0" }}>
                                                                        <FontAwesomeIcon icon={orgSlugCopied ? faSquareCheck : faClone} />
                                                                    </button>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>Neither of these fields can be changed.</p>
                                                    </div>
                                                </div>

                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>Team Name</h3>
                                                            <p>This is the name of your team that other users will see when they look at your team's page.</p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                                <strong>Team Name</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.orgName} disabled={!editModes.orgName} onChange={e => setUserDetails(prev => ({ ...prev, orgName: e.target.value }))} />
                                                                    <button className="profileEditButton" onClick={() => editModes.orgName ? handleSaveTeamInfo("orgName", userDetails.orgName) : setEditModes(prev => ({ ...prev, orgName: true }))} disabled={userDetails.isAdmin !== "true"}>
                                                                        <FontAwesomeIcon icon={editModes.orgName ? faSquareCheck : faPenToSquare} />
                                                                    </button>
                                                                    {editModes.orgName &&
                                                                        <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, orgName: false })) }}>
                                                                            <FontAwesomeIcon icon={faSquareXmark} />
                                                                        </button>
                                                                    }
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        {userDetails.isAdmin !== "true" ? (
                                                            <p>Only a team admin is able to change the team's name.</p>
                                                        ) : (
                                                            <p>Your team name can be changed, but we advise against it.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>Team Contact Information</h3>
                                                            <p>This is the email address and phone number associated with your team. It will not be shared publicly.</p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <div className="profileFieldInput">
                                                                <strong>Email Address</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.orgEmail} disabled={!editModes.orgEmail} onChange={e => setUserDetails(prev => ({ ...prev, orgEmail: e.target.value }))} />
                                                                    <button className="profileEditButton" onClick={() => editModes.orgEmail ? handleSaveTeamInfo("orgEmail", userDetails.orgEmail) : setEditModes(prev => ({ ...prev, orgEmail: true }))} disabled={userDetails.isAdmin !== "true"}>
                                                                        <FontAwesomeIcon icon={editModes.orgEmail ? faSquareCheck : faPenToSquare} />
                                                                    </button>
                                                                    {editModes.orgEmail &&
                                                                        <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, orgEmail: false })) }}>
                                                                            <FontAwesomeIcon icon={faSquareXmark} />
                                                                        </button>
                                                                    }
                                                                </span>
                                                            </div>
                                                            <div className="profileFieldInput" style={{ marginBottom: 0 }}>
                                                                <strong>Phone Number</strong>
                                                                <span>
                                                                    <input placeholder={formatPhoneNumber(userDetails.orgPhone)} disabled={!editModes.orgPhone} onChange={e => setUserDetails(prev => ({ ...prev, orgPhone: e.target.value }))} />
                                                                    <button className="profileEditButton" onClick={() => editModes.orgPhone ? handleSaveTeamInfo("orgPhone", userDetails.orgPhone) : setEditModes(prev => ({ ...prev, orgPhone: true }))} disabled={userDetails.isAdmin !== "true"}>
                                                                        <FontAwesomeIcon icon={editModes.orgPhone ? faSquareCheck : faPenToSquare} />
                                                                    </button>
                                                                    {editModes.orgPhone &&
                                                                        <button className="profileEditButton" onClick={() => { setEditModes(prev => ({ ...prev, orgPhone: false })) }}>
                                                                            <FontAwesomeIcon icon={faSquareXmark} />
                                                                        </button>
                                                                    }
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        {userDetails.isAdmin !== "true" ? (
                                                            <p>Only a team admin is able to change the team's contact information.</p>
                                                        ) : (
                                                            <p>Your team's email address and phone number are not required, but they are highly recommended.</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {userDetails.isAdmin === "true" && (
                                                    <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                                <h3>Delete Team</h3>
                                                                <p style={{ width: "100%" }}>
                                                                    Permanently delete your team data and all of its affiliations and deployments from the platform. This is irreversible.
                                                                </p>
                                                                <button className="profileDeleteButton" onClick={handleTeamDelete}>
                                                                    Delete Team
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                            <p>This action is not reversible, so please continue with caution.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    )}

                                    {settingsState === "security" && (
                                        <>
                                            {userDetails.twofaEnabled !== true ? (
                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>2-Factor Authentication</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Set up two factor authentication when signing into your Stack Forge account. When enabled, Stack Forge will send a code to your phone that you can use to login.
                                                            </p>
                                                            <button className="profileDeleteButton" style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "0.2vh solid #c1c1c1" }} onClick={handleToggleTwoFA}>
                                                                Enable 2-Factor Authentication
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>Two factor authentication is not required, but it is highly recommended.</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>2-Factor Authentication</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Two-factor authentication is already set up for this account. Click below if you want to disable it.
                                                            </p>
                                                            <button className="profileDeleteButton" onClick={handleToggleTwoFA}>
                                                                Disable 2-Factor Authentication
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                        <p>Two factor authentication is not required, but it is highly recommended.</p>
                                                    </div>
                                                </div>
                                            )}

                                            {userDetails.loginNotis !== true ? (
                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>Login Notifications</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Set up login notifications when signing into your Stack Forge account. When enabled, Stack Forge will monitor the location of signins to your account and notify you of suspicious login attempts.
                                                            </p>
                                                            <button className="profileDeleteButton" style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "0.2vh solid #c1c1c1" }} onClick={handleToggleLoginNotifs}>
                                                                Enable Login Notifications
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>Login notifications are not required, but it is highly recommended.</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>Login Notifications</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Login notifications are already set up for this account. Click below if you want to disable it.
                                                            </p>
                                                            <button className="profileDeleteButton" onClick={handleToggleLoginNotifs}>
                                                                Disable Login Notifications
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                        <p>Login notifications are not required, but it is highly recommended.</p>
                                                    </div>
                                                </div>
                                            )}

                                            {userDetails.isAdmin === "true" && (
                                                userDetails.exportNotis !== true ? (
                                                    <div className="profileContentFlexCell">
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                                <h3>Export Notifications</h3>
                                                                <p style={{ width: "100%" }}>
                                                                    Set up export notifications to be alerted whenever one of your team members exports any of your data from the Stack Forge platform.
                                                                </p>
                                                                <button className="profileDeleteButton" style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "0.2vh solid #c1c1c1" }} onClick={handleToggleExportNotifs}>
                                                                    Enable Export Notifications
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom">
                                                            <p>Export notifications are not required, but it is highly recommended.</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                        <div className="profileContentFlexCellTop">
                                                            <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                                <h3>Export Notifications</h3>
                                                                <p style={{ width: "100%" }}>
                                                                    Export notifications are already set up for this account. Click below if you want to disable it.
                                                                </p>
                                                                <button className="profileDeleteButton" onClick={handleToggleExportNotifs}>
                                                                    Disable Export Notifications
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                            <p>Export notifications are not required, but it is highly recommended.</p>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </>
                                    )}

                                    {settingsState === "data" && (
                                        <>
                                            {userDetails.dataSharing !== true ? (
                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>Data Sharing</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Allow the Stack Forge team to use aggregated, anonymized data about your organization's usage and projects to help us improve features, optimize performance, and deliver a better overall experience.
                                                            </p>
                                                            <button className="profileDeleteButton" style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "0.2vh solid #c1c1c1" }} onClick={handleToggleDataShare}>
                                                                Enable Data Sharing
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>Data sharing is not required.</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>Data Sharing</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Data sharing is already set up for this account. Click below if you want to disable it.
                                                            </p>
                                                            <button className="profileDeleteButton" onClick={handleToggleDataShare}>
                                                                Disable Data Sharing
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                        <p>Data sharing is not required.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {settingsState === "github" && (
                                        userDetails.gitUsername === "" || !userDetails.gitUsername ? (
                                            <div className="profileContentFlexCell">
                                                <div className="profileContentFlexCellTop">
                                                    <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                        <h3>Connect GitHub Account</h3>
                                                        <p style={{ width: "100%" }}>
                                                            Connect your GitHub account to enable GitHub integration features such as auto deployments and repository management.
                                                        </p>
                                                        <button className="profileDeleteButton" onClick={() => { handleGithubConnect(userID) }} style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "0.2vh solid #c1c1c1" }}>
                                                            Connect GitHub Account
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="profileContentFlexCellBottom">
                                                    <p>Click the button above to start the connection process with GitHub.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>GitHub Avatar</h3>
                                                            <p>
                                                                This is the image associated with your GitHub account. To change it, you will need to login to your GitHub account and change it there.
                                                            </p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <label className="profileUserImageWrapper" htmlFor="gitImageDisplay" style={{ background: userDetails.gitImage && userDetails.gitImage !== "" ? "none" : "", boxShadow: userDetails.gitImage && userDetails.gitImage !== "" ? "none" : "" }}>
                                                                <img src={userDetails.gitImage} className="profileUserImage" alt="" />
                                                            </label>
                                                            <input style={{ display: "none", padding: 0 }} disabled={true} type="file" id="gitImageDisplay" accept="image/*" />
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>This avatar can only be changed from your GitHub account.</p>
                                                    </div>
                                                </div>

                                                <div className="profileContentFlexCell">
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack">
                                                            <h3>GitHub Account Information</h3>
                                                            <p>This is your GitHub username and the unique ID associated with your account. To change it, you will need to login to your GitHub account and change it there.</p>
                                                        </div>
                                                        <div className="profileTrailingCellStack" style={{ justifyContent: "center", alignItems: "center" }}>
                                                            <div className="profileFieldInput">
                                                                <strong>GitHub Username</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.gitUsername} disabled={true} />
                                                                    <button className="profileEditButton" onClick={handleGitUsernameCopy} style={{ opacity: gitUsernameCopied ? "0.6" : "1.0" }}>
                                                                        <FontAwesomeIcon icon={gitUsernameCopied ? faSquareCheck : faClone} />
                                                                    </button>
                                                                </span>
                                                            </div>
                                                            <div className="profileFieldInput">
                                                                <strong>GitHub ID</strong>
                                                                <span>
                                                                    <input placeholder={userDetails.gitID} disabled={true}/>
                                                                    <button className="profileEditButton" onClick={handleGitIDCopy} style={{ opacity: gitIDCopied ? "0.6" : "1.0" }}>
                                                                        <FontAwesomeIcon icon={gitIDCopied ? faSquareCheck : faClone} />
                                                                    </button>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom">
                                                        <p>This information can only be changed from your GitHub account.</p>
                                                    </div>
                                                </div>

                                                <div className="profileContentFlexCell" style={{ border: "1px solid #E54B4B" }}>
                                                    <div className="profileContentFlexCellTop">
                                                        <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                            <h3>Disconnect GitHub Account</h3>
                                                            <p style={{ width: "100%" }}>
                                                                Disconnect your personal or team GitHub account from the Stack Forge web platform. This may interrupt or break your current deployments.
                                                            </p>
                                                            <button className="profileDeleteButton" onClick={handleGithubDisconnect}>
                                                                Disconnect GitHub Account
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="profileContentFlexCellBottom" style={{ borderTop: "1px solid #E54B4B", backgroundColor: "rgba(229, 75, 75, 0.2)" }}>
                                                        <p>Doing this may cause interruptions to your live projects. Please proceed with caution.</p>
                                                    </div>
                                                </div>
                                            </>
                                        )
                                    )}

                                    {settingsState === "billing" && (
                                        <div className="profileContentFlexCell">
                                            <div className="profileContentFlexCellTop">
                                                <div className="profileLeadingCellStack" style={{ width: "100%" }}>
                                                    <h3>Billing</h3>
                                                    <p style={{ width: "100%" }}>
                                                        Manage your subscription and payment methods using Stripe. Click below to subscribe or manage your billing details. You are allowed to change your subscription or billing management at any time.
                                                    </p>
                                                    {userDetails.isSubscribed ? (
                                                        <button className="profileActionButton" onClick={handleCancelSubscription}>
                                                            Cancel Subscription
                                                        </button>
                                                    ) : (
                                                        <div className="profileActionButtonFlex">
                                                            <button className="profileActionButton" onClick={handleCreateCheckoutSession}>
                                                                Subscribe / Update Payment
                                                            </button>
                                                            <button className="profileActionButton" onClick={handleManageBilling} style={{ marginBottom: 0 }}>
                                                                Manage Billing Portal
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="profileContentFlexCellBottom">
                                                <p>You will be redirected to Stripe to complete or manage your subscription.</p>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>
                    </div>
                )
            ) : (
                <div className="profileCellHeaderContainer" style={{ justifyContent: "center" }}>
                    <div className="loading-wrapper">
                        <div className="loading-circle" />
                        <label className="loading-title">
                            Dino Labs
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Account;