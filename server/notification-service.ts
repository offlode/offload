import { storage } from "./storage";
import { STATUS_NOTIFICATIONS } from "./order-fsm";
import type { Order } from "@shared/schema";

function now(): string {
  return new Date().toISOString();
}

export interface NotificationParams {
  userId: number;
  orderId?: number | null;
  type: string;
  title: string;
  body: string;
  category?: string;
  priority?: string;
  icon?: string;
  actionUrl?: string;
}

/**
 * Create a single notification and optionally emit via WebSocket.
 */
export function createNotification(params: NotificationParams) {
  return storage.createNotification({
    userId: params.userId,
    orderId: params.orderId ?? undefined,
    type: params.type,
    title: params.title,
    body: params.body,
    category: params.category || "system",
    priority: params.priority || "normal",
    icon: params.icon,
    actionUrl: params.actionUrl,
    createdAt: now(),
  });
}

/**
 * Notify all parties associated with an order about a status change.
 */
export function notifyOrderParties(
  order: Order,
  newStatus: string,
  excludeUserId?: number,
) {
  const notifications = STATUS_NOTIFICATIONS[newStatus];
  if (!notifications) return;

  const statusLabel = newStatus.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  // Notify customer
  if (notifications.customer && order.customerId !== excludeUserId) {
    createNotification({
      userId: order.customerId,
      orderId: order.id,
      type: "order_update",
      title: `Order ${statusLabel}`,
      body: notifications.customer
        .replace("{time}", order.pickupTimeWindow || "")
        .replace("{eta}", "~15 min"),
      category: "order_update",
      priority: ["delivered", "cancelled", "arrived_pickup", "arrived_delivery"].includes(newStatus) ? "high" : "normal",
      icon: getIconForStatus(newStatus),
      actionUrl: `/orders/${order.id}`,
    });
  }

  // Notify driver
  if (notifications.driver && order.driverId) {
    const driver = storage.getDriver(order.driverId);
    if (driver && driver.userId !== excludeUserId) {
      createNotification({
        userId: driver.userId,
        orderId: order.id,
        type: "order_update",
        title: `Order ${statusLabel}`,
        body: notifications.driver,
        category: "driver_update",
        priority: "normal",
        icon: getIconForStatus(newStatus),
        actionUrl: `/driver/order/${order.id}`,
      });
    }
  }

  // Notify staff
  if (notifications.staff && order.vendorId) {
    const vendor = storage.getVendor(order.vendorId);
    if (vendor) {
      // Find staff users for this vendor
      const staffUsers = storage.getUsersByRole("laundromat").filter((u) => u.vendorId === order.vendorId);
      staffUsers.forEach((staffUser) => {
        if (staffUser.id !== excludeUserId) {
          createNotification({
            userId: staffUser.id,
            orderId: order.id,
            type: "order_update",
            title: `Order ${statusLabel}`,
            body: notifications.staff!,
            category: "order_update",
            priority: "normal",
            icon: getIconForStatus(newStatus),
            actionUrl: `/staff/weigh/${order.id}`,
          });
        }
      });
    }
  }
}

function getIconForStatus(status: string): string {
  const iconMap: Record<string, string> = {
    scheduled: "Calendar",
    driver_assigned: "UserCheck",
    driver_en_route_pickup: "Truck",
    arrived_pickup: "MapPin",
    picked_up: "Package",
    at_facility: "Building",
    processing: "ClipboardCheck",
    washing: "Droplets",
    drying: "Wind",
    folding: "Shirt",
    ready_for_delivery: "PackageCheck",
    driver_en_route_delivery: "Truck",
    arrived_delivery: "MapPin",
    delivered: "Check",
    completed: "CheckCircle",
    cancelled: "XCircle",
  };
  return iconMap[status] || "Bell";
}
