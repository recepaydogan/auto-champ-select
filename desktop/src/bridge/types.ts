/**
 * Type definitions for bridge opcodes and messages
 */

export const RiftOpcode = {
    OPEN: 1,
    MSG: 2,
    CLOSE: 3,
    CONNECT: 4,
    CONNECT_PUBKEY: 5,
    SEND: 6,
    REPLY: 7,
    RECEIVE: 8
} as const;

export const MobileOpcode = {
    SECRET: 1,
    SECRET_RESPONSE: 2,
    VERSION: 3,
    VERSION_RESPONSE: 4,
    SUBSCRIBE: 5,
    UNSUBSCRIBE: 6,
    REQUEST: 7,
    RESPONSE: 8,
    UPDATE: 9,
    STATUS: 10,          // Desktop -> Mobile: status update
    STATUS_REQUEST: 11   // Mobile -> Desktop: request current status
} as const;

export type RiftOpcodeValue = typeof RiftOpcode[keyof typeof RiftOpcode];
export type MobileOpcodeValue = typeof MobileOpcode[keyof typeof MobileOpcode];

export interface MobileMessage {
    opcode: MobileOpcodeValue;
    data: unknown[];
}

export interface RiftMessage {
    opcode: RiftOpcodeValue;
    data: unknown[];
}

