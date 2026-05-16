interface EventType {
    event_guid: string;
    event_name: string;
    event_type: string;
    event_location: string;
    event_first_date: string;
    event_last_date: string;
    is_active: boolean;
    time_created: string;
}

export {
    type EventType
};