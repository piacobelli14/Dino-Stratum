import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const useAuth = () => {
    const navigate = useNavigate();
    const [token, setTokenState] = useState(null);
    const [userID, setUserID] = useState(null);
    const [organizationID, setOrganizationID] = useState(null); 
    const [isAdmin, setIsAdmin] = useState(false);  
    const [loading, setLoading] = useState(true);

    const isTokenExpired = (token) => {
        if (!token) return true;
        try {
            const decodedToken = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Date.now() / 1000;
            return decodedToken.exp < currentTime;
        } catch (error) {
            return true;
        }
    };

    const decodeToken = (token) => {
        try {
            const decodedToken = JSON.parse(atob(token.split('.')[1]));
            return {
                userID: decodedToken.userid,
                organizationID: decodedToken.orgid,
                isAdmin: decodedToken.isadmin === true || decodedToken.isadmin === 'true'
            };
        } catch (error) {
            return {
                userID: null,
                organizationID: null,
                isAdmin: false
            };
        }
    };

    const setToken = (newToken) => {
        if (newToken) {
            const { userID, organizationID, isAdmin } = decodeToken(newToken);
            setTokenState(newToken);
            setUserID(userID);
            setOrganizationID(organizationID);
            setIsAdmin(isAdmin);
            
            localStorage.setItem('token', newToken);
            localStorage.setItem('userid', userID);
            localStorage.setItem('orgid', organizationID);
            localStorage.setItem('isadmin', isAdmin.toString());
        } else {
            setTokenState(null);
            setUserID(null);
            setOrganizationID(null);
            setIsAdmin(false);  

            localStorage.removeItem('token');
            localStorage.removeItem('userid');
            localStorage.removeItem('orgid');
            localStorage.removeItem('isadmin');
        }
    };

    useEffect(() => {
        const checkTokenExpiration = () => {
            const storedToken = localStorage.getItem('token');

            if (storedToken) {
                if (isTokenExpired(storedToken)) {
                    setToken(null);
                    navigate("/login");
                } else {
                    setToken(storedToken);
                }
            } else {
                const storedUserID = localStorage.getItem('userid');
                const storedOrgID = localStorage.getItem('orgid');
                const storedIsAdmin = localStorage.getItem('isadmin');
                
                if (storedUserID && storedOrgID) {
                    setUserID(storedUserID);
                    setOrganizationID(storedOrgID);
                    setIsAdmin(storedIsAdmin === 'true');
                }
            }
            setLoading(false);
        };

        checkTokenExpiration();
        
        const intervalId = setInterval(checkTokenExpiration, 300000); 

        return () => clearInterval(intervalId);
    }, [navigate]);

    const updateOrganizationID = (newOrgID) => {
        setOrganizationID(newOrgID);
        localStorage.setItem('orgid', newOrgID);
    };

    return { 
        token, 
        setToken, 
        userID, 
        setUserID, 
        organizationID, 
        setOrganizationID: updateOrganizationID, 
        isAdmin,  
        loading 
    };
};

export default useAuth;