import {type RepsTypes} from '../../GamePlayers/Components/RepsInterface';

interface RawRepsData {
    rep_guid: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
    event_first_date: string;
    event_last_date: string;
    event_location: string;
    event_type: string;
}

interface RawCustomersData {
    address: string;
    user_guid: string;
    email: string;
    first_name: string;
    id: number;
    is_admin: boolean;
    last_name: string;
    permission_group: string;
    phone_number: string;
    time_created: string;
}

export interface NewRep {
    CustomerGUID: string;
    FirstName: string;
    LastName: string;
}

export const prepareRepsData = (data: RawRepsData[]): RepsTypes[] => {
    return data.map((item): RepsTypes => ({
        RepGUID: item.rep_guid,
        FirstName: item.first_name,
        LastName: item.last_name,
        IsActive: item.is_active,
        EventFirstDate: new Date(item.event_first_date),
        EventLastDate: new Date(item.event_last_date),
        EventLocation: item.event_location,
        EventType: item.event_type
    }));
};

export const prepareCustomersData = (data: RawCustomersData[]): NewRep[] => {
    return data.map((item): NewRep => ({
        CustomerGUID: item.user_guid,
        FirstName: item.first_name,
        LastName: item.last_name
    }));
};
