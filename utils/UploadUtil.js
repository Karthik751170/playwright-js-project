const path = require("path");
const fs = require("fs");

class UploadUtil {

    static FILES = {
        pdf: "/Users/karthiku/Downloads/Survey Chat _ Hercules.pdf",
        doc: "/Users/karthiku/Downloads/file-sample_100kB.doc",
        image: "/Users/karthiku/Downloads/5efbc20b-491e-462d-bb6a-a713bb511c33.jpeg",
        video: "/Users/karthiku/Downloads/sample-5s.mp4"
    };

    static async upload(page, activeQuestion) {
        try {
            // Entire question text
            const question = (
                await activeQuestion.textContent() || ""
            ).toLowerCase();

            let filePath = null;

            if (question.includes("pdf") || question.includes(".pdf")) {
                filePath = this.FILES.pdf;
            } else if (question.includes("doc") || question.includes("document") || question.includes("word")) {
                filePath = this.FILES.doc;
            } else if (question.includes("image") || question.includes("picture") || question.includes("photo") || question.includes("jpeg") || question.includes("jpg") || question.includes("png")) {
                filePath = this.FILES.image;
            } else if (question.includes("video") || question.includes("mp4")) {
                filePath = this.FILES.video;
            }

            // Fallback to image or pdf if file type not explicitly mentioned in prompt
            if (!filePath || !fs.existsSync(filePath)) {
                filePath = Object.values(this.FILES).find(f => fs.existsSync(f));
                if (!filePath) {
                    filePath = path.resolve(__dirname, '../tests/dummy.txt');
                    console.log(`[UploadUtil] No hardcoded files exist; using absolute fallback: ${filePath}`);
                } else {
                    console.log(`[UploadUtil] No explicit type match or file missing; using fallback: ${filePath}`);
                }
            }

            // 1. Custom Upload Button / Drag-and-Drop FileChooser (Prioritized because it triggers React state reliably)
            const uploadBtn = activeQuestion.locator("button, label, div, span, p")
                .filter({ hasText: /^Upload$|^Browse$|^Choose File$|Upload your file|upload the image/i })
                .first();

            if (await uploadBtn.isVisible().catch(() => false)) {
                const [fileChooser] = await Promise.all([
                    page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null),
                    uploadBtn.click({ force: true }).catch(() => {})
                ]);

                if (fileChooser) {
                    await fileChooser.setFiles(filePath);
                    console.log("[UploadUtil] Uploaded via filechooser event:", filePath);
                    await page.waitForTimeout(1000);
                    return true;
                }
            }

            // 2. Standard file input (Fallback, sometimes fails to trigger React state if disconnected)
            const uploadInput = activeQuestion.locator("input[type='file']").first();
            if (await uploadInput.count() > 0) {
                await uploadInput.setInputFiles(filePath);
                
                // Force dispatch a change event just in case React needs it
                await uploadInput.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true }))).catch(() => {});
                
                console.log("[UploadUtil] Uploaded via input[type='file']:", filePath);
                await page.waitForTimeout(1000);
                return true;
            }
        } catch (e) {
            console.error("[UploadUtil] Error during upload:", e.message);
        }

        console.log("[UploadUtil] Could not find valid upload trigger.");
        return false;
    }
}

module.exports = UploadUtil;
