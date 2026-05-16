interface UserType {
    id: number;
    user_guid: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    address: string;
    permission_group: string;
    is_admin: boolean; // This might be derived, but keeping it for consistency with backend data if it exists
    time_created: string; // ISO string from DB
}

export {
    type UserType
};