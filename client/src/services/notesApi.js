import { getValidAccessToken } from './api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = async () => {
    const token = await getValidAccessToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const fetchNotes = async () => {
    try {
        const response = await fetch(`${API_URL}/notes`, {
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch notes');
        const data = await response.json();
        return data.notes || [];
    } catch (error) {
        console.error("Notes API Error (fetch):", error);
        throw error;
    }
};

export const saveNote = async (note) => {
    try {
        const response = await fetch(`${API_URL}/notes`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(note)
        });
        if (!response.ok) throw new Error('Failed to save note');
        const data = await response.json();
        return data.note;
    } catch (error) {
        console.error("Notes API Error (save):", error);
        throw error;
    }
};

export const deleteNote = async (noteId) => {
    try {
        const response = await fetch(`${API_URL}/notes/${noteId}`, {
            method: 'DELETE',
            headers: await getHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete note');
        return await response.json();
    } catch (error) {
        console.error("Notes API Error (delete):", error);
        throw error;
    }
};
