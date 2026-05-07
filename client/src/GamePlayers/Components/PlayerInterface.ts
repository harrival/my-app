interface Player {
    time_started: string
    time_ended: string
    played_date: null | string | number | Date;
    player_que_number: number | null
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