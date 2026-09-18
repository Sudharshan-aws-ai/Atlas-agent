"""
Unit tests for data loading, cut filtering, corrections, and duplicate subject detection.
"""

from stage1.loader import DataLoader


def test_loader_loads_all_domains():
    loader = DataLoader("hackathon-data")
    dataset = loader.load(cut=None)

    assert len(dataset.subjects) == 241
    assert len(dataset.ae) == 294
    assert len(dataset.lb) == 14400
    assert len(dataset.ex) == 2154
    assert len(dataset.cm) == 468
    assert len(dataset.ds) == 240
    assert len(dataset.vs) == 7200
    assert len(dataset.eg) == 1440
    assert len(dataset.mh) == 488


def test_cut_filtering():
    loader = DataLoader("hackathon-data")
    # At cut 1, only records with cut_available <= 1 are loaded
    dataset_c1 = loader.load(cut=1)
    assert len(dataset_c1.subjects) < 241
    for s in dataset_c1.subjects.values():
        assert s.cut_available <= 1


def test_corrections_applied_at_cut_5():
    loader = DataLoader("hackathon-data")
    # Before cut 5 (e.g. cut 4), 0 corrections should be applied
    dataset_c4 = loader.load(cut=4)
    assert dataset_c4.corrections_applied == 0

    # At cut 5, 200 central lab re-issued corrections should be applied
    dataset_c5 = loader.load(cut=5)
    assert dataset_c5.corrections_applied == 200


def test_duplicate_subject_detection():
    loader = DataLoader("hackathon-data")
    dataset = loader.load(cut=None)

    # Subject 042-S02-013 and 042-S05-021 have identical birth date, sex, and initials
    assert len(dataset.duplicate_enrollments) == 1
    original_id, dup_id = dataset.duplicate_enrollments[0]
    assert dup_id == "042-S05-021"
    assert dataset.subjects[dup_id].is_duplicate_person is True
    assert dataset.subjects[dup_id].duplicate_of_usubjid == original_id
