-- Registrar la transición de FSM ON_ALL_SUCCESS desde Estado 5 hacia Estado 5.1
INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
VALUES (
    (SELECT id FROM public.state_definitions WHERE state_code = '5' AND fsm_id = 1),
    (SELECT id FROM public.state_definitions WHERE state_code = '5.1' AND fsm_id = 1),
    'ON_ALL_SUCCESS',
    1
) ON CONFLICT DO NOTHING;
