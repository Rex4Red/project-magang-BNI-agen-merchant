import unittest

from classify_batch import image_decision


class ImageDecisionTests(unittest.TestCase):
    def test_score_from_reported_false_negative_requires_review(self):
        self.assertEqual(image_decision(0.56, 0.7), "unavailable")

    def test_uncertain_scores_are_not_forced_into_either_class(self):
        for score in (0.31, 0.49, 0.5, 0.69):
            with self.subTest(score=score):
                self.assertEqual(image_decision(score, 0.7), "unavailable")

    def test_clear_scores_can_still_be_classified(self):
        self.assertEqual(image_decision(0.95, 0.7), "potensial")
        self.assertEqual(image_decision(0.05, 0.7), "non_potensial")


if __name__ == "__main__":
    unittest.main()
