from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MERCY_ENV", "local")

from mercy_context import product_capabilities
from template_gallery import DC_TEMPLATE_GALLERY, list_template_gallery

try:
    from fastapi.testclient import TestClient

    from main import app

    FASTAPI_AVAILABLE = True
except ModuleNotFoundError:
    TestClient = None
    app = None
    FASTAPI_AVAILABLE = False


def _headers(tenant_id: str = "tenant-template", user_id: str = "user-template") -> dict[str, str]:
    return {
        "Authorization": "Bearer test-token",
        "X-Mercy-Tenant-Id": tenant_id,
        "X-Mercy-User-Id": user_id,
    }


class TemplateGalleryTests(unittest.TestCase):
    def test_gallery_has_production_dc_templates(self) -> None:
        gallery = list_template_gallery(tenant_context={"tenant_id": "tenant-a", "user_id": "user-a"})

        self.assertGreaterEqual(len(DC_TEMPLATE_GALLERY), 25)
        self.assertGreaterEqual(gallery["template_count"], 25)
        self.assertGreaterEqual(len(gallery["templates"]), 25)
        for template in gallery["templates"]:
            self.assertTrue(template["title"])
            self.assertTrue(template["description"])
            self.assertTrue(template["practice_area"])
            self.assertIn(template["difficulty"], {"beginner", "intermediate", "advanced"})
            self.assertTrue(template["required_inputs"])
            self.assertTrue(template["generation_task"])
            self.assertIn("prompt_template", template)
            self.assertTrue(template["dc_grounding"]["official_sources_only"])
            self.assertTrue(template["dc_grounding"]["attorney_review_required"])

    def test_gallery_filters_by_practice_area_and_difficulty(self) -> None:
        gallery = list_template_gallery(
            tenant_context={"tenant_id": "tenant-a", "user_id": "user-a"},
            practice_area="family",
            difficulty="advanced",
        )

        self.assertTrue(gallery["templates"])
        self.assertTrue(all(template["practice_area"] == "family" for template in gallery["templates"]))
        self.assertTrue(all(template["difficulty"] == "advanced" for template in gallery["templates"]))

    def test_product_capabilities_report_template_gallery(self) -> None:
        capabilities = product_capabilities()

        self.assertIn("template_gallery", capabilities)
        self.assertEqual(capabilities["template_gallery"]["endpoint"], "/v1/templates/gallery")
        self.assertGreaterEqual(capabilities["template_gallery"]["template_count"], 25)

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the active Python environment")
    def test_template_gallery_endpoint_is_tenant_aware_and_filterable(self) -> None:
        with patch.dict(os.environ, {"MERCY_ENV": "test", "MERCY_AUTH_MODE": "test", "MERCY_API_TOKEN": "test-token"}):
            client = TestClient(app)  # type: ignore[arg-type]
            response = client.get(
                "/v1/templates/gallery",
                params={"practice_area": "civil_litigation", "search": "motion"},
                headers=_headers("tenant-gallery"),
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreaterEqual(body["template_count"], 25)
        self.assertTrue(body["templates"])
        self.assertTrue(all(template["practice_area"] == "civil_litigation" for template in body["templates"]))


if __name__ == "__main__":
    unittest.main()
