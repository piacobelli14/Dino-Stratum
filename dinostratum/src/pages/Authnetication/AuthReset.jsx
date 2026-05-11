import { useState, useEffect } from "react"; 
import { useNavigate } from "react-router-dom"; 
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faEye, faEyeSlash, faPerson, faIdCard } from "@fortawesome/free-solid-svg-icons";
import "../../styles/mainStyles/Authentication/AuthReset.css"
import Nav from "../../helpers/Nav";
import useIsTouchDevice from "../../TouchDevice.jsx";


const Reset = () => {
    const navigate = useNavigate(); 
    const isTouchDevice = useIsTouchDevice();
    const [isEmail, setIsEmail] = useState(true); 
    const [isCode, setIsCode] = useState(false);
    const [isReset, setIsReset] = useState(false); 
    const [newPassword, setNewPassword] = useState(""); 
    const [confirmPassword, setConfirmPassword] = useState(""); 
    const [newPasswordVisible, setNewPasswordVisible] = useState(false); 
    const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false); 
    const [resetError, setResetError] = useState(""); 
    const [resetEmail, setResetEmail] = useState(""); 
    const [resetCode, setResetCode] = useState(""); 
    const [resendTimer, setResendTimer] = useState(0);

    useEffect(() => {
        let timerID;
        if (resendTimer > 0) {
            timerID = setTimeout(() => {
                setResendTimer(resendTimer - 1);
            }, 1000);
        }
        return () => clearTimeout(timerID);
    }, [resendTimer]);

    const handleEmail = async () => {
        try {
            setResetError("");

            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/reset-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    email: resetEmail,
                    software: "nightingalewebhub"
                }),
            });

            if (response.status === 200) {
                setIsEmail(false); 
                setIsCode(true); 
                setResetError(""); 
                setResendTimer(30);
            } else if (response.status === 401) {
                setResetError("That email is not in our system.");
            } else {
                setResetError("Something went wrong. Please try again.");
            }
        } catch (error) {
            setResetError("An error occurred while trying to reset the password. Please try again later.");
        }
    };    

    const handleCode = async () => {
        setResetError("");
        if (!resetCode || resetCode.length !== 6) {
            setResetError("Please enter the 6-digit code sent to your email.");
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/verify-reset-code`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: resetEmail,
                    resetCode,
                }),
            });

            if (response.status === 200) {
                setIsCode(false);
                setIsReset(true);
            } else {
                const jsonResponse = await response.json();
                setResetError(jsonResponse.message || "Invalid or expired reset code.");
            }
        } catch (error) {
            setResetError("An error occurred. Please try again later.");
        }
    };
    
    const handlePassword = async () => {
        setResetError("");

        const hasUpperCase = /[A-Z]/.test(newPassword);
        const hasLowerCase = /[a-z]/.test(newPassword);
        const hasNumber = /\d/.test(newPassword);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>\-]/.test(newPassword);
        const isLengthValid = newPassword.length >= 8;

        if (!isLengthValid) {
            setResetError("Password must be at least 8 characters long.");
        } else if (!hasUpperCase) {
            setResetError("Password must contain at least 1 uppercase letter.");
        } else if (!hasLowerCase) {
            setResetError("Password must contain at least 1 lowercase letter.");
        } else if (!hasNumber) {
            setResetError("Password must contain at least 1 number.");
        } else if (!hasSpecialChar) {
            setResetError("Password must contain at least 1 special character.");
        } else if (newPassword !== confirmPassword) {
            setResetError("Passwords do not match.");
        } else {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_AUTH_URL}/change-password`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ 
                        newPassword, 
                        email: resetEmail,
                        resetCode,
                        software: "nightingalewebhub"
                    }),
                });

                if (response.status === 200) {
                    navigate("/login");
                } else {
                    const jsonResponse = await response.json();
                    setResetError(jsonResponse.message || "Failed to reset password. Please try again.");
                }
            } catch (error) {
                setResetError("An error occurred. Please try again later.");
            }
        }
    };

    return (
        <div className="resetPageWrapper"
            style={{ background: "linear-gradient(135deg, #0a0c10 0%, #141820 50%, #1e242e 100%)" }}
        >
            <Nav activePage="sat"/>
            <div className="resetCellHeaderContainer"> 
                {!isTouchDevice && (
                    <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        id="animatedBackgroundEarth"
                        className="loginVideoBackground"
                    >
                        <source src="/LandscapeBackground.mp4" type="video/mp4" />
                    </video>
                )}

                <div className="resetHeroBackgroundWrapper">
                    <div className="resetHeroBackground">
                        <div className="resetBackgroundBlur resetBackgroundBlur1"></div>
                        <div className="resetBackgroundBlur resetBackgroundBlur2"></div>
                        <div className="resetBackgroundBlur resetBackgroundBlur3"></div>
                    </div>

                    <div className="resetGridPattern"/>

                    <div className={!isTouchDevice ? "resetBlock" : "resetBlockTouch"}> 
                        <img
                            className="loginLogo"
                            src="./DinoStratumLogo_Text.png"
                            alt=""
                            style={{scale: "1.4"}}
                        />

                        {isEmail && (
                            <>
                                <div className="loginInputWrapper">
                                    <input className="loginInput" placeholder={"Enter your email address..."} onChange={(e) => setResetEmail(e.target.value)} 
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                handleEmail();
                                            }
                                        }}
                                    />
                                </div>
                            </>
                        )}
                        

                        {isEmail && (
                            <button className="loginInputButton" onClick={handleEmail} style={{ background: "linear-gradient(135deg, #4C3B7E, #906EAF)", "margin": 0 }}>
                                <label className="loginInputText">Continue</label>
                            </button>
                        )}

                        {isCode && (
                            <>
                                <label className="resetPrompt"> 
                                    Enter the 6-digit code that was sent to your email.
                                </label>
                                
                                <div className="loginInputWrapper">
                                    <input 
                                        className="loginInput" 
                                        placeholder={"Enter your reset code..."} 
                                        maxLength={6}
                                        onChange={(e) => setResetCode(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                handleCode();
                                            }
                                        }}
                                    />
                                </div>

                                <button className="loginInputButton" onClick={handleCode} style={{ background: "linear-gradient(135deg, #4C3B7E, #906EAF)", "margin": 0 }}>
                                    <label className="loginInputText">Verify Code</label>
                                </button>

                                <button className="loginSupplementalButton" onClick={() => { setIsEmail(true); setIsCode(false); setResetError(""); }} disabled={resendTimer > 0}>
                                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : <>Didn't get a code? <span style={{"color": "#a855f7", "fontWeight": "800", "opacity": "1"}}>Click here to try again.</span></>}
                                </button>
                            </>
                        )}

                        {isReset && (
                            <>
                                <div className="passwordInputFlexLeading"> 
                                    <input className="passwordInput" type={newPasswordVisible ? "text" : "password"} placeholder={"New Password"} onChange={(e) => setNewPassword(e.target.value)}/>
                                    <FontAwesomeIcon
                                        icon={newPasswordVisible ? faEyeSlash : faEye}
                                        onClick={() => setNewPasswordVisible(!newPasswordVisible)}
                                        className="registerToggleIcon"
                                    />
                                </div>

                                <div className="passwordInputFlex"> 
                                    <input className="passwordInput" type={confirmPasswordVisible ? "text" : "password"} placeholder={"Confirm Password"} onChange={(e) => setConfirmPassword(e.target.value)}/>
                                    <FontAwesomeIcon
                                        icon={confirmPasswordVisible ? faEyeSlash : faEye}
                                        onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                                        className="registerToggleIcon"
                                    />
                                </div>

                                <button className="loginInputButton" onClick={handlePassword} style={{ background: "linear-gradient(135deg, #4C3B7E, #906EAF)", "margin": 0 }}>
                                    <label className="loginInputText">Set New Password</label>
                                </button>
                            </>
                        )}
                        <div className="loginError">{resetError}</div>    
                    </div>
                </div>
            </div>
        </div>
    );
}; 

export default Reset;