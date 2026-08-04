/* The frame buffer holds the pixel/attr/border fetch log at 0x0000..0x65ff,
followed by the Timex screen-mode change log at 0x6600..0x69ff. */
export const FRAME_BUFFER_SIZE = 0x6a00;
export const MODE_LOG_OFFSET = 0x6600;
export const MODE_LOG_MAX_ENTRIES = 255;
