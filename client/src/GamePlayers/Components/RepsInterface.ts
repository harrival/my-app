interface RepsTypes {
    RepGUID: string;
    FirstName: string;
    LastName: string;
    IsActive: boolean;
    EventFirstDate: Date | "N/A";
    EventLastDate: Date | "N/A";
    EventLocation: string;
    EventType: string;
    Business: string;
}


export {
    type RepsTypes
}