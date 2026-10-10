interface Player {
    time_started: string;
    time_ended: string | null;
    played_date: null | string | number | Date;
    id: number;
    player_guid: string;
    username: string;
    puzzle_type: 'CAT' | 'DOG';
    game_status: 'Created' | string;
    highlight?: boolean;
    email: string;
    phone_number: string;
    time_used: string | null;
    time_used_in_sec?: number | null;
    time_modified: string | null;
    rep_id: string | undefined | null;
    business: string | undefined | null;
    event_id: string | undefined | null;
    time_created: string;
}

export {
    type Player
}