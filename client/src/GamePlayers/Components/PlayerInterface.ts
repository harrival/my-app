interface Player {
    id: string;
    player_guid: string;
    username: string;
    puzzle_type: 'CAT' | 'DOG';
    game_status: 'Created' | string;
    highlight?: boolean;
    email: string;
    phone_number: string;
    time_used: string;
    time_modified: string | null;
    rep_id: string;
    event_id: string;
    time_created: string;
}

export {
    type Player
}