export interface ReservationInvitationNotification {
  notification_id: string;
  type: "RESERVATION_INVITED";
  reservation_id: string;
  title: string;
  room_name: string;
  start_at: string;
  end_at: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationCreatedEvent {
  type: "notification.created";
  data: ReservationInvitationNotification;
}
