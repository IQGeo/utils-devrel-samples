import { useState, useEffect, useContext } from 'react';
import AppContext from '../../../appContext';
import { filterUserGroups, loadUserGroups } from '../functions';

export function useUserGroups({ searchValue }) {
    const [userGroups, setUserGroups] = useState([]);
    const [filteredUserGroups, setFilteredUserGroups] = useState([]);
    const { appRef } = useContext(AppContext);

    useEffect(() => {
        loadUserGroups(setUserGroups, appRef.plugins['userGroupManager']);
    }, []);

    useEffect(() => {
        const filteredUserGroups = filterUserGroups(userGroups, searchValue);
        setFilteredUserGroups(filteredUserGroups);
    }, [searchValue, userGroups]);

    return {
        userGroups,
        filteredUserGroups,
        setUserGroups
    };
}
