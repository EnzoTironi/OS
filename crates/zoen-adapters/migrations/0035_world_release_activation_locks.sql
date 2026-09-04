-- A World's active-pointer row does not exist before its first activation.
-- Keep one stable row per World so competing first candidates can lock before
-- either reads or writes the pointer.

CREATE TABLE world_release_activation_locks (
    world_id TEXT PRIMARY KEY
);
