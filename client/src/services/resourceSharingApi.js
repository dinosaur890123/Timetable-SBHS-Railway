const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://synchron.work/api';

// Search for users by student ID or name
export const searchUsers = async (query) => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to search users');
  return response.json();
};

// Share a resource with another student
export const shareResource = async (recipientId, resourceType, resourceId, title, description) => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/resources/share`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipientId, resourceType, resourceId, title, description })
  });
  if (!response.ok) throw new Error('Failed to share resource');
  return response.json();
};

// Get resources shared by current user
export const getSentResources = async () => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/resources/sent`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to fetch sent resources');
  return response.json();
};

// Get resources received by current user
export const getReceivedResources = async () => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/resources/received`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to fetch received resources');
  return response.json();
};

// Update resource share status (accept/decline)
export const updateResourceStatus = async (shareId, status) => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/resources/${shareId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error('Failed to update resource status');
  return response.json();
};

// Get user notifications
export const getNotifications = async (unreadOnly = false) => {
  const token = localStorage.getItem('sbhs_token');
  const url = `${API_BASE_URL}/api/notifications${unreadOnly ? '?unreadOnly=true' : ''}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to fetch notifications');
  return response.json();
};

// Mark notification as read
export const markNotificationRead = async (notificationId) => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to mark notification as read');
  return response.json();
};

// Mark all notifications as read
export const markAllNotificationsRead = async () => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to mark all notifications as read');
  return response.json();
};

// Get unread notification count
export const getUnreadNotificationCount = async () => {
  const token = localStorage.getItem('sbhs_token');
  const response = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) throw new Error('Failed to get unread count');
  return response.json();
};
