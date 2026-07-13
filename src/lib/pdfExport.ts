import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import JSZip from 'jszip';

/**
 * 임금명세서 DOM 요소 → PDF 변환 + 다건 zip 압축 유틸리티.
 * html2canvas-pro를 사용하는 이유: 이 프로젝트는 Tailwind CSS v4를 사용하는데,
 * v4는 기본 색상 팔레트를 oklch()/lab() 색상 함수로 생성합니다. 구버전 html2canvas는
 * 이 색상 함수들을 지원하지 않아 색상이 깨지므로, oklch/lab을 지원하는 -pro 포크를 사용합니다.
 */

async function elementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  if (imgHeight <= usableHeight) {
    // 한 페이지에 다 들어가는 경우
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
  } else {
    // 내용이 길어 여러 페이지로 잘라서 출력해야 하는 경우
    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;
    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;
    }
  }

  return pdf.output('blob');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 임금명세서 DOM 요소 1개를 PDF로 변환해 바로 다운로드 (단일 직원용). */
export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<void> {
  const blob = await elementToPdfBlob(element);
  downloadBlob(blob, fileName);
}

/** 여러 임금명세서 DOM 요소를 각각 PDF로 변환한 뒤 zip으로 묶어 다운로드 (전직원 일괄용). */
export async function downloadElementsAsPdfZip(
  items: Array<{ element: HTMLElement; fileName: string }>,
  zipFileName: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();

  for (let i = 0; i < items.length; i++) {
    const { element, fileName } = items[i];
    const blob = await elementToPdfBlob(element);
    zip.file(fileName, blob);
    onProgress?.(i + 1, items.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, zipFileName);
}
