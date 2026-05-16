import React, { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/Events.module.css'; // Import CSS module
import AddEventForm from '../../UI/Form/AddEventForm';
import EditEventForm from '../../UI/Form/EditEventForm';
import { EventType } from "./EventInterface";

interface EventsProps {
    onBack?: () => void;
}

const Events: React.FC<EventsProps> = ({ onBack }) => {
    const [events, setEvents] = useState<EventType[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null);
    const [showEditEventForm, setShowEditEventForm] = useState<boolean>(false);
    const [showAddEvent, setShowAddEvent] = useState<boolean>(false);
    const [refreshTrigger, setRefreshTrigger] = useState<number>(0); // Local state to trigger re-fetch

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await axios.get(`${BASE_URL}/getAll`, {
                    params: { 
                        tableName: "events_table",
                        orderBy: 'event_first_date',
                        sortDir: 'DESC'
                    }
                });
                setEvents(response.data);
            } catch (error) {
                console.error('Error fetching events:', error);
            }
        };
        fetchEvents();
    }, [refreshTrigger]); // Re-fetch when local trigger changes

    const handleDeleteEvent = async (eventGuid: string) => {
        if (window.confirm("Are you sure you want to delete this event?")) {
            try {
                await axios.delete(`${BASE_URL}/deleteItem/events_table/event_guid/${eventGuid}`);
                console.log("Event deleted successfully");
                setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
            } catch (error) {
                console.error('Error deleting event:', error);
                alert("Failed to delete event.");
            }
        }
    };

    const handleEditEvent = (event: EventType) => {
        setSelectedEvent(event);
        setShowEditEventForm(true);
    };

    const handleCloseAddEventForm = () => {
        setShowAddEvent(false);
        setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
    };

    const handleCloseEditEventForm = () => {
        setShowEditEventForm(false);
        setSelectedEvent(null);
        setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
    };

    return (
        <div className={classes.eventsManagementPanel}>
            <div className={classes.headerContainer}>
                <h1>Events Management</h1>
                <div className={classes.buttonGroup}>
                    {onBack && <button className={classes.actionButton} onClick={onBack}>Back to Admin</button>}
                    <button className={classes.actionButton} onClick={() => setShowAddEvent(true)}>Add Event</button>
                </div>
            </div>
            
            {showAddEvent && <AddEventForm onClose={handleCloseAddEventForm} onSuccess={handleCloseAddEventForm} />}
            {showEditEventForm && selectedEvent && <EditEventForm event={selectedEvent} onClose={handleCloseEditEventForm} onSuccess={handleCloseEditEventForm} />}

            <table className={classes.table}>
                <thead>
                    <tr>
                        <th className={classes.tableTh}>Event Type</th>
                        <th className={classes.tableTh}>Location</th>
                        <th className={classes.tableTh}>Start Date</th>
                        <th className={classes.tableTh}>End Date</th>
                        <th className={classes.tableTh}>Active</th>
                        <th className={classes.tableTh} style={{ textAlign: "center" }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {events.map((event) => (
                        <tr key={event.event_guid}>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{event.event_type}</td>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{event.event_location}</td>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{new Date(event.event_first_date).toLocaleDateString()}</td>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{new Date(event.event_last_date).toLocaleDateString()}</td>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{event.is_active ? "Yes" : "No"}</td>
                            <td className={`${classes.tableTd} ${classes.tableTdCenter}`}>
                                <button 
                                    className={`${classes.actionButton} ${classes.editButton}`} 
                                    onClick={() => handleEditEvent(event)}
                                >
                                    Edit
                                </button>
                                <button 
                                    className={classes.actionButton} 
                                    onClick={() => handleDeleteEvent(event.event_guid)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Events;